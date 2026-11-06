import { describe, it, expect } from 'vitest'
import {
  normalizeDescription,
  keywordFallback,
  matchCategoryNameInDescription,
  coreFingerprint,
  keywordMatches,
  isNoAutoCategory,
  MIN_CATEGORY_NAME_MATCH_LENGTH,
  MIN_FINGERPRINT_LENGTH,
  type CategoryOption,
} from './categorization'

// Categorias padrão criadas para novos usuários (ver ensureDefaultCategoriesForImport
// em src/lib/actions/categories.ts) — usadas aqui porque são o cenário mais comum
// de uma primeira importação, exatamente o caso relatado no bug.
const DEFAULT_CATEGORIES: CategoryOption[] = [
  { id: 'alimentacao', name: 'Alimentação', type: 'expense', icon: '🍽️', parent_id: null },
  { id: 'assinaturas', name: 'Assinaturas', type: 'expense', icon: '📱', parent_id: null },
  { id: 'lazer', name: 'Lazer', type: 'expense', icon: '🎬', parent_id: null },
  { id: 'moradia', name: 'Moradia', type: 'expense', icon: '🏠', parent_id: null },
  { id: 'outros', name: 'Outros', type: 'expense', icon: '📦', parent_id: null },
  { id: 'saude', name: 'Saúde', type: 'expense', icon: '💊', parent_id: null },
  { id: 'transferencia', name: 'Transferência', type: 'expense', icon: '↔️', parent_id: null },
  { id: 'transporte', name: 'Transporte', type: 'expense', icon: '🚗', parent_id: null },
  { id: 'receitas', name: 'Receitas', type: 'income', icon: '💰', parent_id: null },
]

describe('normalizeDescription', () => {
  it('lowercases, strips accents and collapses punctuation to spaces', () => {
    expect(normalizeDescription('Supermercado — Bom De Preço')).toBe('supermercado bom de preco')
  })

  it('collapses repeated whitespace and trims', () => {
    expect(normalizeDescription('  Uber   *Trip  ')).toBe('uber trip')
  })
})

describe('keywordFallback — descrições reconhecíveis recebem a categoria correta', () => {
  it('mapeia "Supermercado — Bom De Preço" para Alimentação', () => {
    const id = keywordFallback('Supermercado — Bom De Preço', DEFAULT_CATEGORIES)
    expect(id).toBe('alimentacao')
  })

  it('mapeia "Uber *Trip São Paulo" para Transporte', () => {
    const id = keywordFallback('Uber *Trip São Paulo', DEFAULT_CATEGORIES)
    expect(id).toBe('transporte')
  })

  it('mapeia "Ifood *Restaurante Chines" para Alimentação', () => {
    const id = keywordFallback('Ifood *Restaurante Chines', DEFAULT_CATEGORIES)
    expect(id).toBe('alimentacao')
  })

  it('mapeia "Netflix.com" para uma categoria de entretenimento/assinatura ("Lazer" ganha por ser a primeira das categorias-padrão a bater um dos padrões do grupo streaming)', () => {
    const id = keywordFallback('Netflix.com', DEFAULT_CATEGORIES)
    expect(id).toBe('lazer')
  })

  it('mapeia "Salário Empresa XYZ Ltda" para Receitas', () => {
    const id = keywordFallback('Salário Empresa XYZ Ltda', DEFAULT_CATEGORIES)
    expect(id).toBe('receitas')
  })

  it('retorna null para uma descrição genérica sem nenhum padrão reconhecível', () => {
    const id = keywordFallback('DOC 000123456 REF 9F8A2', DEFAULT_CATEGORIES)
    expect(id).toBeNull()
  })
})

// Árvore de categorias real com subcategorias (ver seedDefaultCategories em
// src/lib/actions/categories.ts) — usada aqui porque é o cenário do bug
// relatado: "Alimentação — Nova Goulart" bate com a categoria-pai
// "Alimentação", não com nenhuma das subcategorias específicas.
const TREE_CATEGORIES: CategoryOption[] = [
  { id: 'moradia', name: 'Moradia', type: 'expense', icon: '🏠', parent_id: null },
  { id: 'telefonia-internet', name: 'Telefonia e internet', type: 'expense', icon: '📡', parent_id: 'moradia' },
  { id: 'alimentacao', name: 'Alimentação', type: 'expense', icon: '🍽️', parent_id: null },
  { id: 'supermercado', name: 'Supermercado', type: 'expense', icon: '🛒', parent_id: 'alimentacao' },
  { id: 'restaurantes', name: 'Restaurantes e lanchonetes', type: 'expense', icon: '🍴', parent_id: 'alimentacao' },
  { id: 'delivery', name: 'Delivery', type: 'expense', icon: '🛵', parent_id: 'alimentacao' },
  { id: 'padaria', name: 'Padaria e café', type: 'expense', icon: '☕', parent_id: 'alimentacao' },
]

describe('matchCategoryNameInDescription — correspondência direta com nome de categoria cadastrada', () => {
  it('"Alimentação — Nova Goulart" bate com a categoria-pai "Alimentação" (a IA sozinha não reconheceria "Nova Goulart", mas o texto já cita a categoria)', () => {
    const match = matchCategoryNameInDescription('Alimentação — Nova Goulart', TREE_CATEGORIES)
    expect(match?.id).toBe('alimentacao')
  })

  it('quando mais de um nome de categoria aparece no texto, prioriza o mais longo/específico', () => {
    const match = matchCategoryNameInDescription('Alimentação — Supermercado Extra', TREE_CATEGORIES)
    expect(match?.id).toBe('supermercado')
  })

  it('não bate por coincidência com nomes de categoria curtos demais (abaixo do limiar mínimo)', () => {
    const categories: CategoryOption[] = [
      { id: 'ok', name: 'Ok', type: 'expense', icon: null, parent_id: null }, // 2 chars < MIN_CATEGORY_NAME_MATCH_LENGTH
    ]
    expect('poker'.includes('ok')).toBe(true) // a substring realmente aparece...
    expect(MIN_CATEGORY_NAME_MATCH_LENGTH).toBeGreaterThan(2) // ...mas é curta demais pra confiar
    const match = matchCategoryNameInDescription('Torneio de Poker Online', categories)
    expect(match).toBeNull()
  })

  it('retorna null quando nenhum nome de categoria aparece na descrição', () => {
    const match = matchCategoryNameInDescription('DOC 000123456 REF 9F8A2', TREE_CATEGORIES)
    expect(match).toBeNull()
  })
})

describe('coreFingerprint — reconhece a mesma contraparte recorrente apesar do sufixo numérico mudar', () => {
  it('"Contas — Telefonica 05/2026" e "Contas — Telefonica 06/2026" geram o mesmo fingerprint', () => {
    const a = coreFingerprint('Contas — Telefonica 05/2026')
    const b = coreFingerprint('Contas — Telefonica 06/2026')
    expect(a).toBe(b)
    expect(a).toBe('contas telefonica')
  })

  it('"Compras — Limpon Descartaveis" repetida em meses diferentes com número de nota fiscal diferente ainda bate', () => {
    const a = coreFingerprint('Compras — Limpon Descartaveis NF 88213')
    const b = coreFingerprint('Compras — Limpon Descartaveis NF 90447')
    expect(a).toBe(b)
  })

  it('um número de apólice/matrícula isolado no meio do texto (ex. "66 497 247") é removido do fingerprint', () => {
    const a = coreFingerprint('Seguro Auto Apólice 66 497 247 Renovação')
    const b = coreFingerprint('Seguro Auto Apólice 71 802 933 Renovação')
    expect(a).toBe(b)
  })

  it('fingerprints muito curtos e genéricos (ex. só "pix" depois de tirar os números) ficam abaixo do limiar mínimo — não são usados para buscar histórico', () => {
    const fp = coreFingerprint('Pix 04829371')
    expect(fp).toBe('pix')
    expect(fp.length).toBeLessThan(MIN_FINGERPRINT_LENGTH)
  })
})

// ─── Comparação por palavra e filtro por tipo ─────────────────────────────────

describe('keywordFallback — palavra inteira (bug "ceb" em "recebimento")', () => {
  const CATS: CategoryOption[] = [
    ...DEFAULT_CATEGORIES,
    { id: 'energia', name: 'Energia', type: 'expense', icon: null, parent_id: null },
    { id: 'combustivel', name: 'Combustível', type: 'expense', icon: null, parent_id: null },
    { id: 'educacao', name: 'Educação', type: 'expense', icon: null, parent_id: null },
    { id: 'viagem', name: 'Viagem', type: 'expense', icon: null, parent_id: null },
    { id: 'farmacia', name: 'Farmácia e higiene', type: 'expense', icon: null, parent_id: null },
    { id: 'beleza', name: 'Cuidados pessoais', type: 'expense', icon: null, parent_id: null },
    { id: 'gas', name: 'Gás', type: 'expense', icon: null, parent_id: null },
    { id: 'telefonia', name: 'Telefonia e internet', type: 'expense', icon: null, parent_id: null },
    { id: 'salario', name: 'Salário', type: 'income', icon: null, parent_id: null },
  ]

  it('"RECEBIMENTO PIX - ..." não vai para Energia', () => {
    expect(keywordFallback('RECEBIMENTO PIX - 11122233344 Joao Titular Exemplo', CATS)).toBeNull()
    expect(keywordFallback('CEB DISTRIBUICAO', CATS)).toBe('energia')
  })

  it.each([
    ['PIX - 19912345678 FULANO', 'transporte'],      // "99" dentro de CPF
    ['UBERLANDIA COMERCIO', 'transporte'],           // "uber"
    ['PAGAMENTO IMPOSTO MUNICIPAL', 'combustivel'],  // "posto" dentro de "imposto"
    ['PIX PAULA SOUZA', 'educacao'],                 // "aula"
    ['PIX ALESSANDRA', 'combustivel'],               // "ale"
    ['ESPACO KIDS', 'beleza'],                       // "spa"
    ['GASTOS DIVERSOS', 'gas'],                      // "gas"
    ['PAGTO ULTIMO MES', 'telefonia'],               // "tim"
    ['EXTRATO MENSAL', 'alimentacao'],               // "extra"
  ])('%j não casa por trecho de palavra (antes ia para %s)', (desc) => {
    expect(keywordFallback(desc, CATS)).toBeNull()
  })

  it.each([
    ['UBER *TRIP', 'transporte'],
    ['99 TAXI', 'transporte'],
    ['99POP VIAGEM', 'transporte'],
    ['DROGARIA SAO PAULO', 'farmacia'],
    ['PIZZARIA DO ZE', 'alimentacao'],
    ['AUTO POSTO SHELL', 'combustivel'],
    ['AUTOPOSTO CENTRAL', 'combustivel'],
    ['SUPERMERCADOS BH', 'alimentacao'],
    ['HIPERMERCADO BOM', 'alimentacao'],
    ['CAFETERIA CENTRAL', 'alimentacao'],
    ['SUPERMERCADO EXTRA', 'alimentacao'],
    ['PAO DE ACUCAR 123', 'alimentacao'],
    ['VIVO FIBRA', 'telefonia'],
    ['BAR E RESTAURANTE EXEMPLO LTDA', 'alimentacao'],
  ])('%j continua indo para %s', (desc, expected) => {
    expect(keywordFallback(desc, CATS)).toBe(expected)
  })

  it('com tipo: um crédito não recebe categoria de despesa', () => {
    expect(keywordFallback('RECEBIMENTO PIX - POUSADA EXEMPLO LTDA ME', CATS)).toBe('viagem')
    expect(keywordFallback('RECEBIMENTO PIX - POUSADA EXEMPLO LTDA ME', CATS, 'income')).toBeNull()
    expect(keywordFallback('SALARIO EMPRESA X', CATS, 'income')).toBe('salario')
    expect(keywordFallback('SALARIO EMPRESA X', CATS, 'expense')).toBeNull()
    expect(keywordFallback('UBER *TRIP', CATS, 'expense')).toBe('transporte')
  })

  it('matchCategoryNameInDescription respeita o tipo', () => {
    expect(matchCategoryNameInDescription('Transporte — reembolso', DEFAULT_CATEGORIES, 'income')).toBeNull()
    expect(matchCategoryNameInDescription('Transporte — app', DEFAULT_CATEGORIES, 'expense')?.id).toBe('transporte')
  })
})

describe('keywordMatches', () => {
  it('palavra inteira, plural com "s", prefixo só a partir de 5 letras, várias palavras em sequência', () => {
    expect(keywordMatches('recebimento pix', 'ceb')).toBe(false)
    expect(keywordMatches('ceb distribuicao', 'ceb')).toBe(true)
    expect(keywordMatches('lojas americanas', 'loja')).toBe(true)
    expect(keywordMatches('cafeteria', 'cafe')).toBe(false)
    expect(keywordMatches('drogaria', 'droga')).toBe(true)
    expect(keywordMatches('extrato', 'extra')).toBe(false)
    expect(keywordMatches('pao de acucar', 'pao de acucar')).toBe(true)
    expect(keywordMatches('pao de queijo', 'pao de acucar')).toBe(false)
    expect(keywordMatches('supergasbras', 'supergasbrás')).toBe(true)
  })
})

describe('isNoAutoCategory', () => {
  it('integralização de capital não recebe categoria automática', () => {
    expect(isNoAutoCategory('INTEGRALIZACAO DE CAPITAL POR DEBITO EM CONTA')).toBe(true)
    expect(isNoAutoCategory('Integralização de capital')).toBe(true)
    expect(isNoAutoCategory('PAGAMENTO PIX - CAPITAL')).toBe(false)
    expect(keywordFallback('INTEGRALIZACAO DE CAPITAL POR DEBITO EM CONTA', DEFAULT_CATEGORIES)).toBeNull()
  })
})
