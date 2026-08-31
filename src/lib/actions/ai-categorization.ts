'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  normalizeDescription,
  keywordFallback,
  matchCategoryNameInDescription,
  coreFingerprint,
  MIN_FINGERPRINT_LENGTH,
  type CategoryOption,
} from '@/lib/utils/categorization'

// Helper: acessa tabelas não incluídas nos tipos gerados ainda
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table(supabase: Awaited<ReturnType<typeof createClient>>, name: string) {
  return (supabase as unknown as { from: (t: string) => any }).from(name)
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CategorySuggestion {
  category_id: string | null
  category_name: string
  description_suggestion: string
  confidence: 'high' | 'medium' | 'low'
  source: 'rule' | 'ai' | 'keyword' | 'auto'
}

// Número de confirmações consistentes (mesmo padrão → mesma categoria) a
// partir do qual a transação é categorizada automaticamente, sem exigir
// confirmação manual do usuário. Fácil de ajustar depois.
const AUTO_APPLY_CONFIRM_THRESHOLD = 3

// ─── PASSO 1 — Regras aprendidas ──────────────────────────────────────────────

async function lookupRule(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pattern: string,
  entityId: string | null,
  userId: string,
): Promise<{ category_id: string; match_count: number; confirm_count: number } | null> {
  let query = table(supabase, 'category_rules')
    .select('id, category_id, match_count, confirm_count')
    .eq('user_id', userId)
    .eq('pattern', pattern)

  if (entityId) {
    query = query.eq('entity_id', entityId)
  } else {
    query = query.is('entity_id', null)
  }

  const { data } = await query.limit(1).single()
  if (!data) return null
  // confirm_count pode não existir ainda (coluna adicionada em migration
  // separada) — trata como 1 confirmação implícita até a migration rodar.
  return { category_id: data.category_id, match_count: data.match_count, confirm_count: data.confirm_count ?? 1 }
}

async function incrementConfirmCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pattern: string,
  entityId: string | null,
  userId: string,
): Promise<void> {
  let query = table(supabase, 'category_rules')
    .select('id, confirm_count')
    .eq('user_id', userId)
    .eq('pattern', pattern)

  if (entityId) query = query.eq('entity_id', entityId)
  else query = query.is('entity_id', null)

  const { data } = await query.limit(1).single()
  if (!data) return

  await table(supabase, 'category_rules')
    .update({ confirm_count: (data.confirm_count ?? 1) + 1, updated_at: new Date().toISOString() })
    .eq('id', data.id)
}

async function incrementMatchCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pattern: string,
  entityId: string | null,
  userId: string,
): Promise<void> {
  let query = table(supabase, 'category_rules')
    .select('id, match_count')
    .eq('user_id', userId)
    .eq('pattern', pattern)

  if (entityId) query = query.eq('entity_id', entityId)
  else query = query.is('entity_id', null)

  const { data } = await query.limit(1).single()
  if (!data) return

  await table(supabase, 'category_rules')
    .update({ match_count: (data.match_count ?? 0) + 1, updated_at: new Date().toISOString() })
    .eq('id', data.id)
}

// ─── PASSO 2 — Histórico de transações já categorizadas pelo usuário ──────────

// category_rules (Passo 1) só bate quando a descrição normalizada é IDÊNTICA
// a uma já vista antes — na prática isso quase nunca acontece em extratos
// reais, porque a maioria das cobranças recorrentes (conta de telefone,
// mensalidade, boleto) embute um número que muda a cada ocorrência (data,
// nº da fatura/contrato). Esse passo busca no histórico de transações já
// categorizadas do próprio usuário por um "fingerprint" que ignora esses
// números isolados — ver coreFingerprint() — então reconhece que "Contas —
// Telefonica 05/2026" é a mesma contraparte recorrente de "Contas —
// Telefonica 04/2026", mesmo com o sufixo mudando.
const HISTORY_LOOKBACK_MONTHS = 12
const HISTORY_SCAN_LIMIT = 500

// Só reaproveita categoria de transações passadas cuja fonte indica uma
// decisão já validada por um humano (clique manual, ou uma regra que já
// acumulou confirmações suficientes para auto-aplicar) — nunca de uma
// transação que ela mesma só tinha uma sugestão de IA/palavra-chave não
// revisada, para não propagar um palpite errado adiante.
const TRUSTED_HISTORY_SOURCES = ['manual', 'rule', 'auto'] as const

interface HistoryCandidate {
  description: string | null
  category_id: string | null
  category: { name: string } | null
}

async function findHistoricalCategoryMatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  description: string,
  entityId: string | null,
  userId: string,
): Promise<{ category_id: string; category_name: string } | null> {
  const fingerprint = coreFingerprint(description)
  if (fingerprint.length < MIN_FINGERPRINT_LENGTH) return null

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - HISTORY_LOOKBACK_MONTHS)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  let query = supabase
    .from('transactions')
    .select('description, category_id, category:categories(name)')
    .eq('user_id', userId)
    .not('category_id', 'is', null)
    .in('category_source', TRUSTED_HISTORY_SOURCES)
    .neq('type', 'transfer')
    .eq('is_mirror', false)
    .gte('date', cutoffStr)
    .order('date', { ascending: false })
    .limit(HISTORY_SCAN_LIMIT)

  if (entityId) query = query.eq('entity_id', entityId)

  const { data } = await query
  if (!data) return null

  for (const row of data as unknown as HistoryCandidate[]) {
    if (row.category_id && coreFingerprint(row.description ?? '') === fingerprint) {
      return { category_id: row.category_id, category_name: row.category?.name ?? '' }
    }
  }
  return null
}

// ─── PASSO 4 — IA via OpenRouter ────────────────────────────────────────────────

// Modelo escolhido: google/gemini-flash-1.5-8b. Critérios (esta chamada roda em
// onBlur do formulário de transação, então latência baixa é mandatório, e roda
// em toda transação nova, então custo por chamada importa mais que qualidade de
// geração de texto longo): é um dos modelos mais rápidos e baratos disponíveis
// na OpenRouter (~US$0,0375 / 1M tokens de entrada), e para uma classificação
// curta (escolher 1 de N categorias fixas) sua qualidade é suficiente — não
// precisamos da capacidade de um modelo maior como gpt-4o-mini para essa tarefa.
const OPENROUTER_MODEL = 'google/gemini-flash-1.5-8b'
// Reaproveita a mesma env var já usada em toda a base (callbacks OAuth, Stripe)
// para identificar a URL pública do app — evita cravar um domínio fixo aqui.
const OPENROUTER_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

interface RecentTransaction {
  description: string | null
  amount: number
  category_name: string | null
}

async function fetchRecentTransactions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  entityId: string | null,
): Promise<RecentTransaction[]> {
  let query = supabase
    .from('transactions')
    .select('description, amount, category:categories(name)')
    .eq('user_id', userId)
    .not('category_id', 'is', null)
    .order('date', { ascending: false })
    .limit(20)

  if (entityId) query = query.eq('entity_id', entityId)

  const { data } = await query
  return (data ?? []).map((t: unknown) => {
    const tx = t as { description: string | null; amount: number; category: { name: string } | null }
    return {
      description: tx.description,
      amount: tx.amount,
      category_name: tx.category?.name ?? null,
    }
  })
}

async function callOpenRouter(
  description: string,
  amount: number | undefined,
  categories: CategoryOption[],
  recentTx: RecentTransaction[],
): Promise<{ category_id: string | null; description_suggestion: string; confidence: 'high' | 'medium' | 'low' }> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey || apiKey === 'sk-') {
    return { category_id: null, description_suggestion: description, confidence: 'low' }
  }

  const categoryList = categories
    .map((c) => `- id: "${c.id}" | nome: "${c.name}" | tipo: ${c.type}${c.parent_id ? ' (subcategoria)' : ''}`)
    .join('\n')

  const examplesText = recentTx.length > 0
    ? recentTx
        .map((t) => `  "${t.description ?? ''}" (R$ ${t.amount.toFixed(2)}) → ${t.category_name ?? 'sem categoria'}`)
        .join('\n')
    : '  (sem histórico ainda)'

  const amountText = amount !== undefined ? ` | Valor: R$ ${amount.toFixed(2)}` : ''

  const userPrompt =
    `Descrição da transação: "${description}"${amountText}\n\n` +
    `Categorias disponíveis:\n${categoryList}\n\n` +
    `Exemplos de transações já categorizadas pelo usuário:\n${examplesText}\n\n` +
    `Qual categoria melhor se encaixa? Responda SOMENTE o JSON pedido.`

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': OPENROUTER_APP_URL,
        'X-Title': 'FinApp',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: 200,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'Você é um assistente de categorização financeira para um brasileiro. ' +
              'SEMPRE tente escolher a categoria mais provável, mesmo sem histórico do usuário para ' +
              'essa descrição específica — use seu conhecimento geral de padrões comuns de descrições ' +
              'bancárias brasileiras (ex.: "uber"/"99"/"táxi" → transporte; nomes de redes de ' +
              'supermercado ou a palavra "supermercado" → alimentação/mercado; "ifood"/"rappi" → ' +
              'delivery/alimentação; "netflix"/"spotify" → assinaturas; etc.). ' +
              'Use `confidence` para indicar o quão seguro você está — "high" quando o padrão é claro ' +
              'ou bate com o histórico do usuário, "medium" quando é um palpite razoável por padrão ' +
              'comum, "low" quando a descrição é ambígua mas ainda assim você está sugerindo a melhor ' +
              'aposta. Só devolva `category_id: null` quando a descrição realmente não der nenhum ' +
              'indício (ex.: um código genérico sem nenhum padrão reconhecível) — nesse caso raro, ' +
              'ainda assim marque confidence como "low". ' +
              'Responda APENAS em JSON válido, sem markdown, neste formato exato:\n' +
              '{"category_id":"uuid da categoria escolhida ou null","description_suggestion":"nome limpo da transação em português","confidence":"high|medium|low"}',
          },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!resp.ok) {
      // Não propaga erro pro client (sugestão nunca deve travar o form), mas
      // registra no log do servidor — sem isso, falhas de billing/API ficam
      // invisíveis e o app cai silenciosamente pro fallback de palavras-chave.
      const errBody = await resp.text().catch(() => '')
      console.error(`[ai-categorization] OpenRouter respondeu ${resp.status}: ${errBody.slice(0, 300)}`)
      return { category_id: null, description_suggestion: description, confidence: 'low' }
    }

    const json = await resp.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = json.choices?.[0]?.message?.content?.trim() ?? ''

    // Strip potential markdown fences
    const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(cleaned) as {
      category_id?: string | null
      description_suggestion?: string
      confidence?: string
    }

    const confidence = (['high', 'medium', 'low'] as const).includes(parsed.confidence as 'high' | 'medium' | 'low')
      ? (parsed.confidence as 'high' | 'medium' | 'low')
      : 'medium'

    return {
      category_id: parsed.category_id ?? null,
      description_suggestion: parsed.description_suggestion ?? description,
      confidence,
    }
  } catch (err) {
    // Network timeout, JSON parse error, etc. — never propagate to caller
    console.error('[ai-categorization] Falha ao chamar OpenRouter:', err instanceof Error ? err.message : err)
    return { category_id: null, description_suggestion: description, confidence: 'low' }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sugere categoria para uma descrição de transação.
 *
 * Ordem de precedência (da mais confiável pra mais genérica — cada passo só
 * roda se o anterior não achou nada):
 *   1. Regra aprendida (category_rules) — mesma descrição normalizada já
 *      vista e confirmada antes. confidence 'high', source 'rule'/'auto'.
 *   2. Histórico de transações do usuário — mesma contraparte recorrente
 *      (fingerprint ignorando números que variam por fatura/data) já
 *      categorizada manualmente antes. confidence 'high', source 'rule' —
 *      reaproveita o mesmo badge da regra aprendida porque semanticamente é
 *      a mesma coisa: uma decisão que o próprio usuário já tomou.
 *   3. Correspondência direta com nome de categoria/subcategoria cadastrada
 *      — a descrição cita literalmente o nome de uma categoria do usuário
 *      (ex.: "Alimentação" no texto). confidence 'high', source 'keyword'.
 *   4. IA (OpenRouter), com fallback pra lista de palavras-chave embutida se
 *      a IA não responder — sugestão genérica, sem precedente do usuário.
 *      confidence conforme a IA retornar (inclusive 'low') ou 'medium' fixo
 *      pro fallback de palavra-chave.
 *   5. Sem sugestão nenhuma — confidence 'low', category_id null.
 *
 * Nunca lança erro — categorização é sugestão, não bloqueio.
 */
export async function suggestCategory(
  description: string,
  entityId: string | null,
  amount?: number,
  categories?: CategoryOption[],
): Promise<CategorySuggestion> {
  const fallback: CategorySuggestion = {
    category_id: null,
    category_name: 'Sem categoria',
    description_suggestion: description,
    confidence: 'low',
    source: 'ai',
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return fallback

    const pattern = normalizeDescription(description)
    if (!pattern) return fallback

    // ── PASSO 1: regra aprendida ─────────────────────────────────────────────
    const rule = await lookupRule(supabase, pattern, entityId, user.id)
    if (rule) {
      // Busca nome da categoria para exibir
      const { data: cat } = await supabase
        .from('categories')
        .select('name')
        .eq('id', rule.category_id)
        .single()

      await incrementMatchCount(supabase, pattern, entityId, user.id)

      return {
        category_id: rule.category_id,
        category_name: cat?.name ?? '',
        description_suggestion: description,
        confidence: 'high',
        source: rule.confirm_count >= AUTO_APPLY_CONFIRM_THRESHOLD ? 'auto' : 'rule',
      }
    }

    // ── PASSO 2: histórico de transações já categorizadas pelo usuário ──────
    const historyMatch = await findHistoricalCategoryMatch(supabase, description, entityId, user.id)
    if (historyMatch) {
      return {
        category_id: historyMatch.category_id,
        category_name: historyMatch.category_name,
        description_suggestion: description,
        confidence: 'high',
        source: 'rule',
      }
    }

    // ── Categorias do usuário (usadas pelos passos 3 e 4) ────────────────────
    let catOptions = categories ?? []
    if (catOptions.length === 0) {
      // RLS já filtra pelo usuário autenticado — não precisa de filtro manual
      const { data } = await supabase
        .from('categories')
        .select('id, name, type, icon, parent_id')
        .order('name')
      catOptions = (data ?? []) as CategoryOption[]
    }

    // ── PASSO 3: correspondência direta com nome de categoria cadastrada ────
    const nameMatch = matchCategoryNameInDescription(description, catOptions)
    if (nameMatch) {
      return {
        category_id: nameMatch.id,
        category_name: nameMatch.name,
        description_suggestion: description,
        confidence: 'high',
        source: 'keyword',
      }
    }

    // ── PASSO 4: IA (OpenRouter), com fallback por palavras-chave embutidas ─
    const apiKey = process.env.OPENROUTER_API_KEY
    const aiEnabled = !!apiKey && apiKey !== 'sk-' && apiKey.length > 10
    const recentTx = aiEnabled ? await fetchRecentTransactions(supabase, user.id, entityId) : []
    const aiResult = await callOpenRouter(description, amount, catOptions, recentTx)

    if (!aiResult.category_id) {
      const kwCatId = keywordFallback(description, catOptions)
      if (kwCatId) {
        const kwCat = catOptions.find((c) => c.id === kwCatId)
        return {
          category_id: kwCatId,
          category_name: kwCat?.name ?? '',
          description_suggestion: description,
          confidence: 'medium',
          source: 'keyword',
        }
      }
      return { ...fallback, description_suggestion: aiResult.description_suggestion }
    }

    // Valida que o category_id devolvido realmente existe na lista
    const matched = catOptions.find((c) => c.id === aiResult.category_id)

    return {
      category_id: matched?.id ?? null,
      category_name: matched?.name ?? 'Sem categoria',
      description_suggestion: aiResult.description_suggestion,
      confidence: aiResult.confidence,
      source: 'ai',
    }
  } catch (err) {
    console.error('[ai-categorization] suggestCategory falhou:', err instanceof Error ? err.message : err)
    return fallback
  }
}

/**
 * Persiste uma regra aprendida (upsert).
 * Chamado quando o usuário confirma uma categorização — seja vinda da IA
 * ou de uma escolha manual após sugestão.
 */
export async function learnRule(
  description: string,
  categoryId: string,
  entityId: string | null,
): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const pattern = normalizeDescription(description)
    if (!pattern) return

    // Tenta incrementar se já existe
    const existing = await lookupRule(supabase, pattern, entityId, user.id)
    if (existing) {
      if (existing.category_id !== categoryId) {
        // Usuário corrigiu para uma categoria diferente da regra aprendida →
        // quebra de confiança. Decisão: zera match_count E confirm_count (não
        // apenas decrementa) porque o histórico acumulado media confiança na
        // categoria ANTERIOR — ele não é um sinal válido para a categoria
        // nova, então recomeça do zero (1 = esta própria confirmação). Isso
        // também garante que uma regra que estava auto-aplicando (confirm_count
        // >= AUTO_APPLY_CONFIRM_THRESHOLD) e foi corrigida volte a pedir
        // confirmação manual até acumular confiança de novo.
        let q = table(supabase, 'category_rules')
          .select('id')
          .eq('user_id', user.id)
          .eq('pattern', pattern)
        if (entityId) q = q.eq('entity_id', entityId)
        else q = q.is('entity_id', null)
        const { data: row } = await q.limit(1).single()
        if (row) {
          await table(supabase, 'category_rules')
            .update({ category_id: categoryId, match_count: 1, confirm_count: 1, updated_at: new Date().toISOString() })
            .eq('id', row.id)
        }
      } else {
        await incrementMatchCount(supabase, pattern, entityId, user.id)
        await incrementConfirmCount(supabase, pattern, entityId, user.id)
      }
      return
    }

    // Insere nova regra
    await table(supabase, 'category_rules').insert({
      user_id: user.id,
      entity_id: entityId,
      pattern,
      category_id: categoryId,
      match_count: 1,
      confirm_count: 1,
    })
  } catch (err) {
    // Falhas silenciosas — aprendizado é best-effort
    console.error('[ai-categorization] learnRule falhou:', err instanceof Error ? err.message : err)
  }
}

// ─── Propagação retroativa de correções ────────────────────────────────────────

// Transações mais antigas que isso não são alcançadas pela propagação — reduz
// o risco de tocar em decisões desatualizadas (ex.: o usuário mudou de
// trabalho/endereço e o mesmo texto de descrição passou a significar outra
// coisa) e mantém a operação rápida mesmo em contas com muito histórico.
const PROPAGATION_LOOKBACK_MONTHS = 12

// Fontes que indicam que a categoria NUNCA foi revisada por um humano — só
// essas são elegíveis para serem sobrescritas pela correção retroativa.
// 'manual' e 'rule'/'auto' representam decisões já validadas (um clique
// humano direto, ou confiança acumulada de confirmações passadas) e nunca
// são tocadas aqui. 'propagated' entra na lista para que uma propagação
// anterior possa ser corrigida por uma nova, sem travar em um estado antigo.
const UNREVIEWED_SOURCES = ['ai', 'keyword', 'propagated'] as const

export interface PropagationResult {
  updated: number
}

/**
 * Quando o usuário corrige manualmente a categoria de uma transação, aplica
 * a mesma categoria em outras transações passadas (mesmo usuário, mesmo
 * padrão de descrição normalizado) que ainda não foram revisadas por um
 * humano — nunca sobrescreve algo que o próprio usuário já confirmou/ajustou.
 *
 * Fingerprint de "mesmo padrão": reaproveita normalizeDescription(), a mesma
 * lógica usada pelo Passo 1 (category_rules). Decisão deliberada de NÃO
 * reforçar o fingerprint com valor/data: usar a mesma definição de "padrão"
 * em todo o app evita que uma transação corrigida deixe de bater com a
 * própria regra aprendida que a originou, o que seria confuso e mais
 * arriscado do que o ganho de precisão de um fingerprint mais complexo.
 *
 * Roda como Server Action separada, chamada pelo client sem await (mesmo
 * padrão já usado por learnRule) — não bloqueia o salvamento da correção.
 */
export async function propagateCorrection(
  description: string,
  categoryId: string,
  entityId: string | null,
  excludeTransactionId: string,
): Promise<PropagationResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { updated: 0 }

    const pattern = normalizeDescription(description)
    if (!pattern) return { updated: 0 }

    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - PROPAGATION_LOOKBACK_MONTHS)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    let query = supabase
      .from('transactions')
      .select('id, description, category_id, category_source')
      .eq('user_id', user.id)
      .neq('id', excludeTransactionId)
      .neq('type', 'transfer')
      .eq('is_mirror', false)
      .gte('date', cutoffStr)
      .in('category_source', UNREVIEWED_SOURCES)

    if (entityId) query = query.eq('entity_id', entityId)

    const { data: candidates, error: selectError } = await query
    if (selectError) {
      console.error('[ai-categorization] propagateCorrection select falhou:', selectError.message)
      return { updated: 0 }
    }
    if (!candidates || candidates.length === 0) return { updated: 0 }

    // Filtra em memória usando a MESMA normalização do Tier 1 — evita duplicar
    // (e divergir de) a lógica de normalização em SQL.
    const ids = candidates
      .filter((t) => t.category_id !== categoryId && normalizeDescription(t.description ?? '') === pattern)
      .map((t) => t.id)

    if (ids.length === 0) return { updated: 0 }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ category_id: categoryId, category_source: 'propagated' })
      .in('id', ids)

    if (updateError) {
      console.error('[ai-categorization] propagateCorrection update falhou:', updateError.message)
      return { updated: 0 }
    }

    revalidatePath('/transactions')
    revalidatePath('/dashboard')
    return { updated: ids.length }
  } catch (err) {
    console.error('[ai-categorization] propagateCorrection falhou:', err instanceof Error ? err.message : err)
    return { updated: 0 }
  }
}
