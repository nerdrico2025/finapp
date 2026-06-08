'use server'

import { createClient } from '@/lib/supabase/server'

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
  source: 'rule' | 'ai' | 'keyword'
}

interface CategoryOption {
  id: string
  name: string
  type: 'income' | 'expense'
  icon: string | null
  parent_id: string | null
}

// ─── Normalização ─────────────────────────────────────────────────────────────

function normalizeDescription(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s]/g, ' ')   // substitui especiais por espaço
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── PASSO 1 — Regras aprendidas ──────────────────────────────────────────────

async function lookupRule(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pattern: string,
  entityId: string | null,
  userId: string,
): Promise<{ category_id: string; match_count: number } | null> {
  let query = table(supabase, 'category_rules')
    .select('id, category_id, match_count')
    .eq('user_id', userId)
    .eq('pattern', pattern)

  if (entityId) {
    query = query.eq('entity_id', entityId)
  } else {
    query = query.is('entity_id', null)
  }

  const { data } = await query.limit(1).single()
  if (!data) return null
  return { category_id: data.category_id, match_count: data.match_count }
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

// ─── PASSO 2 — Palavras-chave embutidas (fallback offline) ────────────────────

// Mapeia palavras comuns em descrições de transações brasileiras para padrões de nomes de categoria.
// Funciona sem API externa — simples inclusão de substring após normalização.
const KEYWORD_RULES: Array<{ words: string[]; categoryPatterns: string[] }> = [
  { words: ['uber', '99', 'cabify', 'indrive', 'taxi', 'onibus', 'metro', 'trem', 'brt', 'vlt', 'passagem'], categoryPatterns: ['transporte', 'mobilidade', 'taxi', 'deslocamento'] },
  { words: ['gasolina', 'etanol', 'combustivel', 'diesel', 'posto', 'shell', 'ipiranga', 'petrobras', 'ale', 'br dte'], categoryPatterns: ['combustivel', 'automovel', 'veiculo', 'transporte'] },
  { words: ['pedagio', 'sem parar', 'veloe', 'movemais', 'estacionamento', 'autopark', 'estapar'], categoryPatterns: ['estacionamento', 'transporte', 'automovel'] },
  { words: ['ifood', 'rappi', 'delivery', 'mcdonalds', 'burguer', 'burger', 'hamburguer', 'pizza', 'dominos', 'habib', 'lanche', 'almoco', 'jantar', 'restaurante', 'refeicao', 'cafe', 'padaria', 'pastel', 'sushi', 'comida', 'bob', 'acougue'], categoryPatterns: ['alimentacao', 'refeicao', 'restaurante', 'comida', 'lanche'] },
  { words: ['supermercado', 'mercado', 'carrefour', 'extra', 'atacadao', 'assai', 'hortifruti', 'feira', 'sacolao', 'pao de acucar', 'bistek', 'walmart', 'barbosa'], categoryPatterns: ['supermercado', 'mercado', 'alimentacao', 'compras'] },
  { words: ['netflix', 'spotify', 'amazon prime', 'disney', 'hbo', 'max', 'globoplay', 'deezer', 'paramount', 'youtube premium', 'crunchyroll', 'mubi', 'apple tv'], categoryPatterns: ['streaming', 'entretenimento', 'lazer', 'assinatura'] },
  { words: ['farmacia', 'drogasil', 'drogaraia', 'drogao', 'droga', 'ultrafarma', 'sempre', 'medicar', 'remedio', 'medicamento', 'receita'], categoryPatterns: ['saude', 'farmacia', 'medicamento', 'saude e beleza'] },
  { words: ['medico', 'clinica', 'hospital', 'consulta', 'exame', 'laboratorio', 'unimed', 'amil', 'bradesco saude', 'hapvida', 'plano de saude', 'dentista'], categoryPatterns: ['saude', 'medico', 'plano de saude'] },
  { words: ['academia', 'smartfit', 'bodytech', 'gympass', 'wellhub', 'crossfit', 'pilates', 'yoga', 'natacao'], categoryPatterns: ['academia', 'fitness', 'esporte', 'lazer', 'saude'] },
  { words: ['luz', 'energia', 'cpfl', 'enel', 'cemig', 'coelba', 'elektro', 'celpe', 'ceb'], categoryPatterns: ['energia', 'luz', 'contas', 'moradia', 'utilidades'] },
  { words: ['agua', 'sabesp', 'sanepar', 'cedae', 'embasa', 'cagece', 'saneago', 'caema'], categoryPatterns: ['agua', 'contas', 'moradia', 'utilidades'] },
  { words: ['gas', 'comgas', 'naturgy', 'ultragaz', 'liquigas', 'supergasbrás'], categoryPatterns: ['gas', 'contas', 'moradia', 'utilidades'] },
  { words: ['internet', 'banda larga', 'vivo', 'claro', 'tim', 'oi', 'algar', 'brisanet', 'desktop'], categoryPatterns: ['internet', 'telefone', 'comunicacao', 'contas'] },
  { words: ['celular', 'recarga', 'tim', 'vivo', 'claro', 'oi', 'plano movel', 'movel'], categoryPatterns: ['telefone', 'comunicacao', 'contas'] },
  { words: ['aluguel', 'condominio', 'iptu', 'alugar', 'locacao', 'imovel'], categoryPatterns: ['moradia', 'aluguel', 'condominio', 'habitacao'] },
  { words: ['escola', 'colegio', 'universidade', 'faculdade', 'curso', 'mensalidade', 'educacao', 'ensino', 'aula', 'ingles', 'idioma', 'livro', 'material escolar'], categoryPatterns: ['educacao', 'escola', 'ensino', 'curso'] },
  { words: ['emprestimo', 'financiamento', 'prestacao', 'parcela', 'boleto', 'divida', 'credito', 'juros', 'tarifa bancaria'], categoryPatterns: ['divida', 'emprestimo', 'financiamento', 'credito'] },
  { words: ['salario', 'vencimento', 'honorarios', 'freelance', 'pgto', 'pag recebido', 'deposito recebido'], categoryPatterns: ['salario', 'receita', 'renda', 'trabalho'] },
  { words: ['investimento', 'aporte', 'poupanca', 'tesouro', 'cdb', 'lci', 'lca', 'fundo', 'acoes', 'dividendo'], categoryPatterns: ['investimento', 'poupanca', 'aporte'] },
  { words: ['roupa', 'vestuario', 'calcado', 'tenis', 'loja', 'zara', 'hm', 'renner', 'riachuelo', 'cea', 'shein', 'netshoes'], categoryPatterns: ['roupas', 'vestuario', 'compras', 'moda'] },
  { words: ['amazon', 'mercado livre', 'shopee', 'americanas', 'magazineluiza', 'magalu', 'submarino', 'casas bahia', 'extra eletro', 'fastshop', 'kabum'], categoryPatterns: ['compras', 'eletronicos', 'varejo', 'lazer'] },
  { words: ['cinema', 'teatro', 'show', 'ingresso', 'eventim', 'ticket', 'sympla', 'parque', 'museu', 'steam', 'jogo'], categoryPatterns: ['lazer', 'entretenimento', 'cultura'] },
  { words: ['viagem', 'hotel', 'pousada', 'airbnb', 'booking', 'hostel', 'passagem aerea', 'latam', 'gol', 'azul', 'decolar'], categoryPatterns: ['viagem', 'turismo', 'hospedagem', 'lazer'] },
  { words: ['salao', 'cabelereiro', 'barba', 'barbearia', 'manicure', 'estetica', 'spa', 'beleza'], categoryPatterns: ['beleza', 'estetica', 'saude e beleza', 'cuidados pessoais'] },
  { words: ['pet', 'veterinario', 'racao', 'petshop', 'cobasi', 'petz', 'animal'], categoryPatterns: ['pet', 'animais', 'veterinario'] },
  { words: ['seguro', 'seguros', 'corretor', 'porto seguro', 'bradesco seguro', 'sulamerica', 'mapfre', 'tokio'], categoryPatterns: ['seguro', 'seguros', 'protecao'] },
]

function keywordFallback(description: string, categories: CategoryOption[]): string | null {
  const normalized = normalizeDescription(description)
  for (const { words, categoryPatterns } of KEYWORD_RULES) {
    const matched = words.some((w) => normalized.includes(w))
    if (!matched) continue
    for (const pattern of categoryPatterns) {
      const cat = categories.find((c) => normalizeDescription(c.name).includes(pattern))
      if (cat) return cat.id
    }
  }
  return null
}

// ─── PASSO 3 — DeepSeek ───────────────────────────────────────────────────────

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

async function callDeepSeek(
  description: string,
  amount: number | undefined,
  categories: CategoryOption[],
  recentTx: RecentTransaction[],
): Promise<{ category_id: string | null; description_suggestion: string; confidence: 'high' | 'medium' | 'low' }> {
  const apiKey = process.env.DEEPSEEK_API_KEY
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
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        max_tokens: 200,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'Você é um assistente de categorização financeira para um brasileiro. ' +
              'Responda APENAS em JSON válido, sem markdown, neste formato exato:\n' +
              '{"category_id":"uuid da categoria escolhida ou null","description_suggestion":"nome limpo da transação em português","confidence":"high|medium|low"}',
          },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!resp.ok) {
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
  } catch {
    // Network timeout, JSON parse error, etc. — never propagate to caller
    return { category_id: null, description_suggestion: description, confidence: 'low' }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sugere categoria para uma descrição de transação.
 * Prioridade: regra aprendida → IA → fallback null.
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
        source: 'rule',
      }
    }

    // ── PASSO 2: palavras-chave + DeepSeek (precisam das categorias do usuário) ─
    let catOptions = categories ?? []
    if (catOptions.length === 0) {
      const filter = entityId
        ? `and(user_id.eq.${user.id},entity_id.eq.${entityId}),is_default.eq.true`
        : `and(user_id.eq.${user.id},entity_id.is.null),is_default.eq.true`

      const { data } = await supabase
        .from('categories')
        .select('id, name, type, icon, parent_id')
        .or(filter)
        .order('name')
      catOptions = (data ?? []) as CategoryOption[]
    }

    const apiKey = process.env.DEEPSEEK_API_KEY
    const deepseekEnabled = !!apiKey && apiKey !== 'sk-' && apiKey.length > 10
    const recentTx = deepseekEnabled ? await fetchRecentTransactions(supabase, user.id, entityId) : []
    const aiResult = await callDeepSeek(description, amount, catOptions, recentTx)

    if (!aiResult.category_id) {
      // ── PASSO 3: fallback por palavras-chave embutidas ─────────────────────
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
  } catch {
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
        // Usuário escolheu categoria diferente da regra → atualiza
        let q = table(supabase, 'category_rules')
          .select('id')
          .eq('user_id', user.id)
          .eq('pattern', pattern)
        if (entityId) q = q.eq('entity_id', entityId)
        else q = q.is('entity_id', null)
        const { data: row } = await q.limit(1).single()
        if (row) {
          await table(supabase, 'category_rules')
            .update({ category_id: categoryId, match_count: 1, updated_at: new Date().toISOString() })
            .eq('id', row.id)
        }
      } else {
        await incrementMatchCount(supabase, pattern, entityId, user.id)
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
    })
  } catch {
    // Falhas silenciosas — aprendizado é best-effort
  }
}
