// Lógica pura de categorização por palavras-chave — extraída de
// ai-categorization.ts para poder ser testada sem depender de Supabase/Next
// (arquivos 'use server' só podem exportar async functions).

export interface CategoryOption {
  id: string
  name: string
  type: 'income' | 'expense'
  icon: string | null
  parent_id: string | null
}

export function normalizeDescription(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s]/g, ' ')   // substitui especiais por espaço
    .replace(/\s+/g, ' ')
    .trim()
}

// Mapeia palavras comuns em descrições de transações brasileiras para padrões de nomes de categoria.
// Funciona sem API externa — comparação por palavra após normalização (ver keywordMatches).
export const KEYWORD_RULES: Array<{ words: string[]; categoryPatterns: string[] }> = [
  { words: ['uber', '99', '99pop', '99app', 'cabify', 'indrive', 'taxi', 'onibus', 'metro', 'trem', 'brt', 'vlt', 'passagem'], categoryPatterns: ['aplicativos de transporte', 'transporte', 'mobilidade', 'taxi', 'deslocamento'] },
  { words: ['gasolina', 'etanol', 'combustivel', 'diesel', 'posto', 'autoposto', 'shell', 'ipiranga', 'petrobras', 'ale', 'br dte'], categoryPatterns: ['combustivel', 'automovel', 'veiculo', 'transporte'] },
  { words: ['pedagio', 'sem parar', 'veloe', 'movemais', 'estacionamento', 'autopark', 'estapar'], categoryPatterns: ['estacionamento', 'transporte', 'automovel'] },
  { words: ['ifood', 'rappi', 'delivery', 'mcdonalds', 'burguer', 'burger', 'hamburguer', 'pizza', 'dominos', 'habib', 'lanche', 'almoco', 'jantar', 'restaurante', 'refeicao', 'cafe', 'cafeteria', 'padaria', 'pastel', 'sushi', 'comida', 'bob', 'acougue'], categoryPatterns: ['alimentacao', 'refeicao', 'restaurante', 'comida', 'lanche'] },
  { words: ['supermercado', 'hipermercado', 'mercado', 'carrefour', 'extra', 'atacadao', 'assai', 'hortifruti', 'feira', 'sacolao', 'pao de acucar', 'bistek', 'walmart', 'barbosa'], categoryPatterns: ['supermercado', 'mercado', 'alimentacao', 'compras'] },
  { words: ['netflix', 'spotify', 'amazon prime', 'disney', 'hbo', 'max', 'globoplay', 'deezer', 'paramount', 'youtube premium', 'crunchyroll', 'mubi', 'apple tv'], categoryPatterns: ['streaming', 'entretenimento', 'lazer', 'assinatura'] },
  { words: ['farmacia', 'drogasil', 'drogaraia', 'drogao', 'droga', 'ultrafarma', 'sempre', 'medicar', 'remedio', 'medicamento', 'higiene', 'receita'], categoryPatterns: ['farmacia e higiene', 'saude', 'farmacia', 'medicamento'] },
  { words: ['medico', 'clinica', 'hospital', 'consulta', 'exame', 'laboratorio', 'unimed', 'amil', 'bradesco saude', 'hapvida', 'plano de saude', 'dentista'], categoryPatterns: ['saude', 'medico', 'plano de saude'] },
  { words: ['academia', 'smartfit', 'bodytech', 'gympass', 'wellhub', 'crossfit', 'pilates', 'yoga', 'natacao'], categoryPatterns: ['academia', 'fitness', 'esporte', 'lazer', 'saude'] },
  { words: ['luz', 'energia', 'cpfl', 'enel', 'cemig', 'coelba', 'elektro', 'celpe', 'ceb'], categoryPatterns: ['energia', 'luz', 'contas', 'moradia', 'utilidades'] },
  { words: ['agua', 'sabesp', 'sanepar', 'cedae', 'embasa', 'cagece', 'saneago', 'caema'], categoryPatterns: ['agua', 'contas', 'moradia', 'utilidades'] },
  { words: ['gas', 'comgas', 'naturgy', 'ultragaz', 'liquigas', 'supergasbrás'], categoryPatterns: ['gas', 'contas', 'moradia', 'utilidades'] },
  { words: ['internet', 'banda larga', 'net', 'vivo fibra', 'tim live', 'oi fibra', 'claro net', 'algar', 'brisanet', 'desktop'], categoryPatterns: ['telefonia e internet', 'internet', 'moradia', 'comunicacao'] },
  { words: ['celular', 'recarga', 'tim', 'vivo', 'claro', 'oi', 'plano celular', 'plano movel', 'movel', 'telefone'], categoryPatterns: ['telefonia e internet', 'telefone', 'moradia', 'comunicacao'] },
  { words: ['aluguel', 'condominio', 'iptu', 'alugar', 'locacao', 'imovel'], categoryPatterns: ['moradia', 'aluguel', 'condominio', 'habitacao'] },
  { words: ['escola', 'colegio', 'universidade', 'faculdade', 'curso', 'mensalidade', 'educacao', 'ensino', 'aula', 'ingles', 'idioma', 'livro', 'material escolar'], categoryPatterns: ['educacao', 'escola', 'ensino', 'curso'] },
  { words: ['emprestimo', 'financiamento', 'prestacao', 'parcela', 'boleto', 'divida', 'credito', 'juros', 'tarifa bancaria'], categoryPatterns: ['divida', 'emprestimo', 'financiamento', 'credito'] },
  { words: ['salario', 'vencimento', 'honorarios', 'freelance', 'pgto', 'pag recebido', 'deposito recebido'], categoryPatterns: ['salario', 'receita', 'renda', 'trabalho'] },
  { words: ['dividendo', 'rendimento', 'cdb', 'lci', 'lca', 'fundo', 'acoes', 'tesouro direto', 'fiis', 'fii', 'debênture', 'debenture', 'juros sobre capital', 'jcp', 'provento', 'cupom'], categoryPatterns: ['rendimentos de investimentos', 'rendimento', 'investimento'] },
  { words: ['investimento', 'aporte', 'poupanca', 'tesouro', 'aplicacao', 'resgate'], categoryPatterns: ['investimento', 'poupanca', 'aporte'] },
  { words: ['roupa', 'vestuario', 'calcado', 'tenis', 'loja', 'zara', 'hm', 'renner', 'riachuelo', 'cea', 'shein', 'netshoes'], categoryPatterns: ['roupas', 'vestuario', 'compras', 'moda'] },
  { words: ['amazon', 'mercado livre', 'shopee', 'americanas', 'magazineluiza', 'magalu', 'submarino', 'casas bahia', 'extra eletro', 'fastshop', 'kabum'], categoryPatterns: ['compras', 'eletronicos', 'varejo', 'lazer'] },
  { words: ['cinema', 'teatro', 'show', 'ingresso', 'eventim', 'ticket', 'sympla', 'parque', 'museu', 'steam', 'jogo'], categoryPatterns: ['lazer', 'entretenimento', 'cultura'] },
  { words: ['viagem', 'hotel', 'pousada', 'airbnb', 'booking', 'hostel', 'passagem aerea', 'latam', 'gol', 'azul', 'decolar'], categoryPatterns: ['viagem', 'turismo', 'hospedagem', 'lazer'] },
  { words: ['salao', 'cabelereiro', 'barbearia', 'manicure', 'pedicure', 'estetica', 'spa', 'perfume', 'maquiagem', 'shampoo', 'condicionador', 'beleza'], categoryPatterns: ['cuidados pessoais', 'salao e estetica', 'beleza', 'estetica'] },
  { words: ['pet', 'veterinario', 'racao', 'petshop', 'cobasi', 'petz', 'animal'], categoryPatterns: ['pet', 'animais', 'veterinario'] },
  { words: ['seguro', 'seguros', 'corretor', 'porto seguro', 'bradesco seguro', 'sulamerica', 'mapfre', 'tokio'], categoryPatterns: ['seguro', 'seguros', 'protecao'] },
]

// Palavras-chave com pelo menos esse tamanho também casam como início de
// palavra ("droga" → "drogaria", "pizza" → "pizzaria"). As mais curtas só
// casam como palavra inteira (ou com "s" de plural): antes a comparação era por
// trecho, e "ceb" casava dentro de "recebimento", "oi" dentro de "boleto"…
export const MIN_PREFIX_KEYWORD_LENGTH = 5

// Palavras longas que, como prefixo, casariam com termos comuns de extrato
// sem relação com a categoria ("extra" → "extrato").
const WHOLE_WORD_ONLY_KEYWORDS = new Set(['extra'])

/**
 * A palavra-chave (já pode ter várias palavras, ex.: "pao de acucar") aparece
 * na descrição normalizada como sequência de palavras inteiras. A última
 * palavra aceita plural com "s" e, se tiver MIN_PREFIX_KEYWORD_LENGTH letras
 * ou mais, também casa como início de palavra.
 */
export function keywordMatches(normalizedDescription: string, keyword: string): boolean {
  const k = normalizeDescription(keyword)
  if (!k || !normalizedDescription) return false
  const tokens = normalizedDescription.split(' ')
  const parts = k.split(' ')
  const allowPrefix = k.length >= MIN_PREFIX_KEYWORD_LENGTH && !WHOLE_WORD_ONLY_KEYWORDS.has(k)
  for (let i = 0; i + parts.length <= tokens.length; i++) {
    let ok = true
    for (let j = 0; j < parts.length && ok; j++) {
      const t = tokens[i + j]
      const p = parts[j]
      const last = j === parts.length - 1
      ok = t === p || (last && (t === `${p}s` || (allowPrefix && t.startsWith(p))))
    }
    if (ok) return true
  }
  return false
}

/**
 * Sugestão por palavras-chave embutidas. Com `type`, só devolve categorias
 * desse tipo (um crédito nunca recebe categoria de despesa e vice-versa).
 */
export function keywordFallback(
  description: string,
  categories: CategoryOption[],
  type?: 'income' | 'expense',
): string | null {
  const normalized = normalizeDescription(description)
  const pool = type ? categories.filter((c) => c.type === type) : categories
  for (const { words, categoryPatterns } of KEYWORD_RULES) {
    const matched = words.some((w) => keywordMatches(normalized, w))
    if (!matched) continue
    for (const pattern of categoryPatterns) {
      const cat = pool.find((c) => normalizeDescription(c.name).includes(pattern))
      if (cat) return cat.id
    }
  }
  return null
}

// ─── Descrições sem categoria automática ──────────────────────────────────────

// Lançamentos que o usuário sempre categoriza na mão (nenhum passo da
// sugestão — regra, histórico, nome, IA ou palavra-chave — propõe categoria).
// Integralização de capital em cooperativa (Sicredi etc.) é aporte na cota do
// associado: depende de como cada um controla isso.
const NO_AUTO_CATEGORY_PATTERNS: RegExp[] = [
  /\bintegralizacao de capital\b/,
]

export function isNoAutoCategory(description: string): boolean {
  const n = normalizeDescription(description ?? '')
  return NO_AUTO_CATEGORY_PATTERNS.some((re) => re.test(n))
}

// ─── Correspondência direta com nome de categoria/subcategoria cadastrada ─────

// Nomes de categoria mais curtos que isso não entram na comparação — evita
// que uma categoria genérica de poucas letras "bata" por coincidência dentro
// de uma descrição sem relação nenhuma com ela.
export const MIN_CATEGORY_NAME_MATCH_LENGTH = 4

/**
 * Verifica se o texto da descrição contém, literalmente, o nome de uma das
 * categorias (ou subcategorias) já cadastradas pelo usuário — ex.: a própria
 * palavra "Alimentação" aparecendo na descrição de uma transação de mercado.
 * Diferente de keywordFallback (que depende de uma lista fixa de nomes de
 * estabelecimentos conhecidos), essa checagem usa os nomes reais cadastrados
 * pelo usuário, então cobre qualquer categoria — inclusive personalizadas.
 *
 * Quando várias categorias batem, prioriza o nome mais longo/específico
 * (ex.: "Restaurantes e lanchonetes" antes de um nome curto que também bata).
 */
export function matchCategoryNameInDescription(
  description: string,
  categories: CategoryOption[],
  type?: 'income' | 'expense',
): CategoryOption | null {
  const normalizedDesc = normalizeDescription(description)
  if (!normalizedDesc) return null

  const candidates = categories
    .filter((c) => !type || c.type === type)
    .map((c) => ({ category: c, normalizedName: normalizeDescription(c.name) }))
    .filter(({ normalizedName }) => normalizedName.length >= MIN_CATEGORY_NAME_MATCH_LENGTH)
    .filter(({ normalizedName }) => normalizedDesc.includes(normalizedName))
    .sort((a, b) => b.normalizedName.length - a.normalizedName.length)

  return candidates[0]?.category ?? null
}

// ─── Fingerprint para correspondência com histórico de transações ────────────

// Fingerprints mais curtos que isso não são usados para buscar no histórico —
// termos genéricos e curtos (ex.: só "pix" ou só "boleto" depois de remover
// números) combinam por acaso com contrapartes completamente diferentes,
// então teriam mais chance de reaproveitar a categoria errada do que acertar.
export const MIN_FINGERPRINT_LENGTH = 8

/**
 * Extrai o "núcleo" semântico de uma descrição de transação, removendo
 * números isolados (data, número de contrato/fatura/matrícula) que variam a
 * cada cobrança do mesmo estabelecimento mas não mudam de quem é a
 * transação — ex.: "Contas — Telefonica 05/2026" e "Contas — Telefonica
 * 06/2026" viram o mesmo fingerprint "contas telefonica", permitindo
 * reconhecer que é a mesma contraparte recorrente mesmo com o sufixo
 * numérico mudando a cada mês/fatura.
 */
export function coreFingerprint(description: string): string {
  return normalizeDescription(description)
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
