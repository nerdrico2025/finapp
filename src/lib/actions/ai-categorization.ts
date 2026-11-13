'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  normalizeDescription,
  keywordFallback,
  matchCategoryNameInDescription,
  isNoAutoCategory,
  coreFingerprint,
  MIN_FINGERPRINT_LENGTH,
  classifyAiHttpFailure,
  classifyAiException,
  chooseRule,
  allowedCategoryIds,
  DEFAULT_OPENROUTER_MODEL,
  type AiFailure,
  type CategoryOption,
  type StoredRule,
} from '@/lib/utils/categorization'
import { getActiveEntityId } from '@/lib/entity'

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
  /** A IA foi consultada e não respondeu (motivo); null quando não falhou ou nem foi consultada. */
  ai_failure: AiFailure | null
}

// Número de confirmações consistentes (mesmo padrão → mesma categoria) a
// partir do qual a transação é categorizada automaticamente, sem exigir
// confirmação manual do usuário. Fácil de ajustar depois.
const AUTO_APPLY_CONFIRM_THRESHOLD = 3

// ─── Entidade ─────────────────────────────────────────────────────────────────

/**
 * Entidade usada pela categorização: a informada pelo chamador, se o usuário
 * for membro dela; senão (ou sem informar) a entidade ativa da sessão.
 */
async function resolveEntityId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  requested: string | null | undefined,
): Promise<string | null> {
  if (requested) {
    const { data } = await table(supabase, 'entity_members')
      .select('entity_id')
      .eq('entity_id', requested)
      .eq('user_id', userId)
      .not('accepted_at', 'is', null)
      .maybeSingle()
    if (data?.entity_id) return data.entity_id as string
  }
  return getActiveEntityId(supabase, userId)
}

/** Contas da entidade (ativas ou não) — o histórico só considera transações delas. */
async function entityAccountIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  entityId: string | null,
): Promise<string[] | null> {
  if (!entityId) return null
  const { data } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('entity_id', entityId)
  return ((data ?? []) as { id: string }[]).map((a) => a.id)
}

/** Categorias da entidade + padrões globais — o mesmo filtro de getCategories. */
async function loadEntityCategories(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  entityId: string | null,
): Promise<CategoryOption[]> {
  const orFilter = entityId
    ? `and(user_id.eq.${userId},entity_id.eq.${entityId}),is_default.eq.true`
    : `and(user_id.eq.${userId},entity_id.is.null),is_default.eq.true`
  const { data } = await supabase
    .from('categories')
    .select('id, name, type, icon, parent_id')
    .or(orFilter)
    .order('name')
  return (data ?? []) as CategoryOption[]
}

// ─── PASSO 1 — Regras aprendidas ──────────────────────────────────────────────

/** Regras do padrão na entidade ativa e as legadas globais (entity_id NULL). */
async function loadRules(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pattern: string,
  entityId: string | null,
  userId: string,
): Promise<StoredRule[]> {
  const base = () => table(supabase, 'category_rules')
    .select('id, entity_id, category_id, match_count, confirm_count')
    .eq('user_id', userId)
    .eq('pattern', pattern)
  const [own, legacy] = await Promise.all([
    entityId ? base().eq('entity_id', entityId).limit(1) : Promise.resolve({ data: [] }),
    base().is('entity_id', null).limit(1),
  ])
  return [...((own.data ?? []) as StoredRule[]), ...((legacy.data ?? []) as StoredRule[])]
}

async function updateRule(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await table(supabase, 'category_rules')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
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
  accountIds: string[] | null,
  userId: string,
  allowed: Set<string>,
): Promise<{ category_id: string; category_name: string } | null> {
  const fingerprint = coreFingerprint(description)
  if (fingerprint.length < MIN_FINGERPRINT_LENGTH) return null
  if (accountIds && accountIds.length === 0) return null

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

  if (accountIds) query = query.in('account_id', accountIds)

  const { data } = await query
  if (!data) return null

  for (const row of data as unknown as HistoryCandidate[]) {
    if (row.category_id && allowed.has(row.category_id) && coreFingerprint(row.description ?? '') === fingerprint) {
      return { category_id: row.category_id, category_name: row.category?.name ?? '' }
    }
  }
  return null
}

// ─── PASSO 4 — IA via OpenRouter ────────────────────────────────────────────────


function openRouterModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL
}
// Reaproveita a mesma env var já usada em toda a base (callbacks OAuth, Stripe)
// para identificar a URL pública do app — evita cravar um domínio fixo aqui.
const OPENROUTER_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

function aiKeyConfigured(): boolean {
  const apiKey = process.env.OPENROUTER_API_KEY
  return !!apiKey && apiKey !== 'sk-' && apiKey.length > 10
}

interface RecentTransaction {
  description: string | null
  amount: number
  category_name: string | null
}

async function fetchRecentTransactions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountIds: string[] | null,
): Promise<RecentTransaction[]> {
  if (accountIds && accountIds.length === 0) return []
  let query = supabase
    .from('transactions')
    .select('description, amount, category:categories(name)')
    .eq('user_id', userId)
    .not('category_id', 'is', null)
    .order('date', { ascending: false })
    .limit(20)

  if (accountIds) query = query.in('account_id', accountIds)

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

interface AiResult {
  category_id: string | null
  description_suggestion: string
  confidence: 'high' | 'medium' | 'low'
  /** Preenchido quando a IA não respondeu (não quando respondeu "null"). */
  failure: AiFailure | null
}

async function callOpenRouter(
  description: string,
  amount: number | undefined,
  categories: CategoryOption[],
  recentTx: RecentTransaction[],
): Promise<AiResult> {
  const failed = (failure: AiFailure): AiResult =>
    ({ category_id: null, description_suggestion: description, confidence: 'low', failure })

  if (!aiKeyConfigured()) return failed({ reason: 'no_key' })
  const apiKey = process.env.OPENROUTER_API_KEY!
  const model = openRouterModel()

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
        model,
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
      // registra no log do servidor e devolve o motivo para a prévia avisar.
      const errBody = await resp.text().catch(() => '')
      console.error(`[ai-categorization] OpenRouter (${model}) respondeu ${resp.status}: ${errBody.slice(0, 300)}`)
      return failed(classifyAiHttpFailure(resp.status, errBody))
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
      failure: null,
    }
  } catch (err) {
    // Network timeout, JSON parse error, etc. — never propagate to caller
    console.error(`[ai-categorization] Falha ao chamar OpenRouter (${model}):`, err instanceof Error ? err.message : err)
    return failed(classifyAiException(err))
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sugere categoria para uma descrição de transação.
 *
 * Ordem de precedência (da mais confiável pra mais genérica — cada passo só
 * roda se o anterior não achou nada):
 *   1. Regra aprendida (category_rules) — mesma descrição normalizada já
 *      vista e confirmada antes, na entidade ativa (ou regra legada global,
 *      entity_id NULL). confidence 'high', source 'rule'/'auto'.
 *   2. Histórico de transações das contas da entidade ativa — mesma
 *      contraparte recorrente (fingerprint ignorando números que variam por
 *      fatura/data) já categorizada manualmente antes. confidence 'high',
 *      source 'rule'.
 *   3. Correspondência direta com nome de categoria/subcategoria cadastrada.
 *      confidence 'high', source 'keyword'.
 *   4. IA (OpenRouter), com fallback pra lista de palavras-chave embutida se
 *      a IA não responder. Se a IA falhou, `ai_failure` diz o motivo.
 *   5. Sem sugestão nenhuma — confidence 'low', category_id null.
 *
 * `categories` é a lista do dropdown; com `type` (receita/despesa da linha),
 * só categorias desse tipo valem. Qualquer id sugerido fora dessa lista é
 * descartado e a busca segue para o passo seguinte. Descrições de
 * isNoAutoCategory() nunca recebem sugestão.
 *
 * `entityId`: entidade da tela; sem ela (ou sem acesso), vale a entidade ativa.
 *
 * Nunca lança erro — categorização é sugestão, não bloqueio.
 */
export async function suggestCategory(
  description: string,
  entityId: string | null,
  amount?: number,
  categories?: CategoryOption[],
  type?: 'income' | 'expense',
): Promise<CategorySuggestion> {
  const fallback: CategorySuggestion = {
    category_id: null,
    category_name: 'Sem categoria',
    description_suggestion: description,
    confidence: 'low',
    source: 'ai',
    ai_failure: null,
  }

  if (isNoAutoCategory(description)) return fallback

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return fallback

    const pattern = normalizeDescription(description)
    if (!pattern) return fallback

    const entity = await resolveEntityId(supabase, user.id, entityId)

    // ── Categorias válidas (as do dropdown, do tipo da linha) ────────────────
    const catOptions = categories && categories.length > 0
      ? categories
      : await loadEntityCategories(supabase, user.id, entity)
    const pool = type ? catOptions.filter((c) => c.type === type) : catOptions
    const allowed = allowedCategoryIds(catOptions, type)
    const nameOf = (id: string) => catOptions.find((c) => c.id === id)?.name ?? ''

    // ── PASSO 1: regra aprendida ─────────────────────────────────────────────
    const rule = chooseRule(await loadRules(supabase, pattern, entity, user.id), entity)
    if (rule && allowed.has(rule.category_id)) {
      await updateRule(supabase, rule.id, { match_count: (rule.match_count ?? 0) + 1 })
      const confirmCount = rule.confirm_count ?? 1
      return {
        category_id: rule.category_id,
        category_name: nameOf(rule.category_id),
        description_suggestion: description,
        confidence: 'high',
        source: confirmCount >= AUTO_APPLY_CONFIRM_THRESHOLD ? 'auto' : 'rule',
        ai_failure: null,
      }
    }

    const accountIds = await entityAccountIds(supabase, user.id, entity)

    // ── PASSO 2: histórico de transações já categorizadas pelo usuário ──────
    const historyMatch = await findHistoricalCategoryMatch(supabase, description, accountIds, user.id, allowed)
    if (historyMatch) {
      return {
        category_id: historyMatch.category_id,
        category_name: historyMatch.category_name || nameOf(historyMatch.category_id),
        description_suggestion: description,
        confidence: 'high',
        source: 'rule',
        ai_failure: null,
      }
    }

    // ── PASSO 3: correspondência direta com nome de categoria cadastrada ────
    const nameMatch = matchCategoryNameInDescription(description, pool)
    if (nameMatch) {
      return {
        category_id: nameMatch.id,
        category_name: nameMatch.name,
        description_suggestion: description,
        confidence: 'high',
        source: 'keyword',
        ai_failure: null,
      }
    }

    // ── PASSO 4: IA (OpenRouter), com fallback por palavras-chave embutidas ─
    const recentTx = aiKeyConfigured() ? await fetchRecentTransactions(supabase, user.id, accountIds) : []
    const aiResult = await callOpenRouter(description, amount, pool, recentTx)

    // Resposta da IA fora da lista (outro tipo, outra entidade, id inventado)
    // é tratada como "sem resposta".
    const aiCategory = aiResult.category_id && allowed.has(aiResult.category_id)
      ? pool.find((c) => c.id === aiResult.category_id)
      : undefined

    if (!aiCategory) {
      const kwCatId = keywordFallback(description, pool)
      if (kwCatId && allowed.has(kwCatId)) {
        return {
          category_id: kwCatId,
          category_name: nameOf(kwCatId),
          description_suggestion: description,
          confidence: 'medium',
          source: 'keyword',
          ai_failure: aiResult.failure,
        }
      }
      return { ...fallback, description_suggestion: aiResult.description_suggestion, ai_failure: aiResult.failure }
    }

    return {
      category_id: aiCategory.id,
      category_name: aiCategory.name,
      description_suggestion: aiResult.description_suggestion,
      confidence: aiResult.confidence,
      source: 'ai',
      ai_failure: null,
    }
  } catch (err) {
    console.error('[ai-categorization] suggestCategory falhou:', err instanceof Error ? err.message : err)
    return fallback
  }
}

/**
 * Persiste uma regra aprendida na entidade ativa (upsert).
 * Chamado quando o usuário confirma uma categorização — seja vinda da IA
 * ou de uma escolha manual após sugestão.
 *
 * A primeira confirmação numa entidade cria a regra dela; se havia regra
 * legada global (entity_id NULL) com a mesma categoria, a nova herda as
 * contagens dela, para não perder a auto-aplicação já conquistada. A regra
 * legada não é alterada (continua valendo para as outras entidades).
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

    const entity = await resolveEntityId(supabase, user.id, entityId)
    const rules = await loadRules(supabase, pattern, entity, user.id)
    // Sem entidade (usuário sem nenhuma — caso de borda pré-migração), a regra
    // é a global mesmo.
    const own = entity ? rules.find((r) => r.entity_id === entity) : rules.find((r) => r.entity_id === null)

    if (own) {
      if (own.category_id !== categoryId) {
        // Usuário corrigiu para uma categoria diferente da regra aprendida →
        // quebra de confiança. Decisão: zera match_count E confirm_count (não
        // apenas decrementa) porque o histórico acumulado media confiança na
        // categoria ANTERIOR — ele não é um sinal válido para a categoria
        // nova, então recomeça do zero (1 = esta própria confirmação). Isso
        // também garante que uma regra que estava auto-aplicando (confirm_count
        // >= AUTO_APPLY_CONFIRM_THRESHOLD) e foi corrigida volte a pedir
        // confirmação manual até acumular confiança de novo.
        await updateRule(supabase, own.id, { category_id: categoryId, match_count: 1, confirm_count: 1 })
      } else {
        await updateRule(supabase, own.id, {
          match_count: (own.match_count ?? 0) + 1,
          confirm_count: (own.confirm_count ?? 1) + 1,
        })
      }
      return
    }

    const legacy = entity ? rules.find((r) => r.entity_id === null && r.category_id === categoryId) : undefined
    await table(supabase, 'category_rules').insert({
      user_id: user.id,
      entity_id: entity,
      pattern,
      category_id: categoryId,
      match_count: legacy ? (legacy.match_count ?? 0) + 1 : 1,
      confirm_count: legacy ? (legacy.confirm_count ?? 1) + 1 : 1,
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
