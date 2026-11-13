import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakeSupabase } from '@/test/fake-supabase'
import { DEFAULT_OPENROUTER_MODEL, type CategoryOption } from '@/lib/utils/categorization'

let fake = createFakeSupabase()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }))
vi.mock('@/lib/entity', () => ({ getActiveEntityId: async () => 'ent-pf' }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { suggestCategory, learnRule } from './ai-categorization'

const CATS: CategoryOption[] = [
  { id: 'alimentacao', name: 'Alimentação', type: 'expense', icon: null, parent_id: null },
  { id: 'restaurantes', name: 'Restaurantes e lanchonetes', type: 'expense', icon: null, parent_id: 'alimentacao' },
  { id: 'moradia', name: 'Moradia', type: 'expense', icon: null, parent_id: null },
  { id: 'telefonia', name: 'Telefonia e internet', type: 'expense', icon: null, parent_id: 'moradia' },
  { id: 'financas', name: 'Finanças e Dívidas', type: 'expense', icon: null, parent_id: null },
  { id: 'consorcio', name: 'Consórcio', type: 'expense', icon: null, parent_id: 'financas' },
  { id: 'outros', name: 'Outros', type: 'expense', icon: null, parent_id: null },
  { id: 'receitas', name: 'Receitas', type: 'income', icon: null, parent_id: null },
  { id: 'outros-receb', name: 'Outros recebimentos', type: 'income', icon: null, parent_id: 'receitas' },
]

function rule(over: Record<string, unknown>) {
  return { id: `r-${Math.random()}`, user_id: 'user-1', match_count: 1, confirm_count: 1, ...over }
}

const ENV = { ...process.env }
beforeEach(() => {
  fake = createFakeSupabase()
  delete process.env.OPENROUTER_API_KEY
  delete process.env.OPENROUTER_MODEL
})
afterEach(() => {
  process.env = { ...ENV }
  vi.unstubAllGlobals()
})

describe('suggestCategory — regras por entidade', () => {
  const desc = 'PAGAMENTO PIX - 11122233344 JOAO TITULAR EXEMPLO'
  const pattern = 'pagamento pix 11122233344 joao titular exemplo'

  it('aplica a regra da entidade ativa, preferindo-a à legada', async () => {
    fake.tables.category_rules = [
      rule({ entity_id: null, pattern, category_id: 'outros' }),
      rule({ entity_id: 'ent-pf', pattern, category_id: 'moradia', confirm_count: 3 }),
    ]
    const s = await suggestCategory(desc, 'ent-pf', 5, CATS, 'expense')
    expect(s.category_id).toBe('moradia')
    expect(s.source).toBe('auto')
  })

  it('aplica a regra legada global (entity_id NULL) na entidade ativa', async () => {
    fake.tables.category_rules = [rule({ entity_id: null, pattern, category_id: 'outros' })]
    const s = await suggestCategory(desc, 'ent-pf', 5, CATS, 'expense')
    expect(s.category_id).toBe('outros')
    expect(s.source).toBe('rule')
  })

  it('ignora a regra de outra entidade', async () => {
    fake.tables.category_rules = [rule({ entity_id: 'ent-pj', pattern, category_id: 'outros' })]
    const s = await suggestCategory(desc, 'ent-pf', 5, CATS, 'expense')
    expect(s.category_id).toBeNull()
  })

  it('sem entidade informada (ou sem acesso), usa a entidade ativa da sessão', async () => {
    fake.tables.category_rules = [rule({ entity_id: 'ent-pf', pattern, category_id: 'moradia' })]
    expect((await suggestCategory(desc, null, 5, CATS, 'expense')).category_id).toBe('moradia')
    // 'ent-pj' sem linha em entity_members → cai na ativa (ent-pf)
    expect((await suggestCategory(desc, 'ent-pj', 5, CATS, 'expense')).category_id).toBe('moradia')
  })

  it('descarta categoria fora do dropdown e segue para os passos seguintes', async () => {
    const restaurante = 'PAGAMENTO PIX - 10000000000808 BAR E RESTAURANTE EXEMPLO LTDA'
    fake.tables.category_rules = [
      rule({ entity_id: null, pattern: 'pagamento pix 10000000000808 bar e restaurante exemplo ltda', category_id: 'cat-de-outra-entidade' }),
    ]
    const s = await suggestCategory(restaurante, 'ent-pf', 153.78, CATS, 'expense')
    expect(s.category_id).toBe('alimentacao')
    expect(s.source).toBe('keyword')
  })

  it('regra com categoria de outro tipo é descartada', async () => {
    fake.tables.category_rules = [rule({ entity_id: 'ent-pf', pattern, category_id: 'receitas' })]
    const s = await suggestCategory(desc, 'ent-pf', 5, CATS, 'expense')
    expect(s.category_id).toBeNull()
  })
})

describe('suggestCategory — histórico só das contas da entidade', () => {
  const desc = 'PAGAMENTO PIX - 10000000001111 TELEFONICA EXEMPLO'
  const recent = new Date().toISOString().slice(0, 10)
  const tx = (account_id: string, category_id: string) => ({
    id: `t-${account_id}`, user_id: 'user-1', account_id, category_id, category_source: 'manual',
    type: 'expense', is_mirror: false, date: recent, description: 'PAGAMENTO PIX - 10000000001111 TELEFONICA EXEMPLO',
    category: { name: category_id },
  })

  it('usa transação de conta da entidade ativa', async () => {
    fake.tables.accounts = [{ id: 'acc-pf', user_id: 'user-1', entity_id: 'ent-pf' }]
    fake.tables.transactions = [tx('acc-pf', 'moradia')]
    const s = await suggestCategory(desc, 'ent-pf', 35, CATS, 'expense')
    expect(s.category_id).toBe('moradia')
    expect(s.source).toBe('rule')
  })

  it('ignora transação de conta de outra entidade', async () => {
    fake.tables.accounts = [
      { id: 'acc-pf', user_id: 'user-1', entity_id: 'ent-pf' },
      { id: 'acc-pj', user_id: 'user-1', entity_id: 'ent-pj' },
    ]
    fake.tables.transactions = [tx('acc-pj', 'outros')]
    const s = await suggestCategory(desc, 'ent-pf', 35, CATS, 'expense')
    // cai na palavra-chave nova ("telefonica"), não no histórico da PJ
    expect(s.category_id).toBe('telefonia')
    expect(s.source).toBe('keyword')
  })
})

describe('suggestCategory — falha da IA', () => {
  const desc = 'PAGAMENTO PIX - 99999999000199 FULANO DE TAL SERVICOS'

  it('sem chave: motivo no_key', async () => {
    const s = await suggestCategory(desc, 'ent-pf', 10, CATS, 'expense')
    expect(s.category_id).toBeNull()
    expect(s.ai_failure).toEqual({ reason: 'no_key' })
  })

  it('HTTP 404/400 de modelo: model_not_found; 401: unauthorized; 429: rate_limited', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-testkey-1234567890'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const [status, body, reason] of [
      [404, 'not found', 'model_not_found'],
      [400, '{"error":{"message":"x is not a valid model ID"}}', 'model_not_found'],
      [401, 'bad key', 'unauthorized'],
      [429, 'slow down', 'rate_limited'],
      [500, 'boom', 'http_error'],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))
      const s = await suggestCategory(desc, 'ent-pf', 10, CATS, 'expense')
      expect(s.ai_failure).toEqual({ reason, status })
    }
  })

  it('timeout e resposta inválida', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-testkey-1234567890'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('timed out', 'TimeoutError') }))
    expect((await suggestCategory(desc, 'ent-pf', 10, CATS, 'expense')).ai_failure).toEqual({ reason: 'timeout' })

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: 'não é json' } }] })))
    expect((await suggestCategory(desc, 'ent-pf', 10, CATS, 'expense')).ai_failure).toEqual({ reason: 'invalid_response' })
  })

  it('usa OPENROUTER_MODEL (ou o padrão) e só aceita categoria do tipo da linha', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-testkey-1234567890'
    const fetchMock = vi.fn(async () => Response.json({
      choices: [{ message: { content: '{"category_id":"receitas","description_suggestion":"x","confidence":"high"}' } }],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const s = await suggestCategory(desc, 'ent-pf', 10, CATS, 'expense')
    expect(s.category_id).toBeNull() // "receitas" é de receita — descartada
    expect(s.ai_failure).toBeNull()
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).model).toBe(DEFAULT_OPENROUTER_MODEL)

    process.env.OPENROUTER_MODEL = 'google/outro-modelo'
    await suggestCategory(desc, 'ent-pf', 10, CATS, 'expense')
    expect(JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).model).toBe('google/outro-modelo')
  })
})

describe('suggestCategory — as 6 descrições do relatório (sem IA)', () => {
  it.each([
    ['PAGAMENTO PIX - 10000000000808 BAR E RESTAURANTE EXEMPLO LTDA', 153.78, 'expense', 'alimentacao'],
    ['PAGAMENTO PIX - 10000000001111 TELEFONICA EXEMPLO', 35, 'expense', 'telefonia'],
    ['PAGAMENTO PIX - 10000000000202 TELECOM EXEMPLO', 129.99, 'expense', 'telefonia'],
    ['PAGAMENTO BOLETO - 10000000000707 ADMINISTRADORA DE CONSORCIO EXEMPLO LTDA', 942.51, 'expense', 'consorcio'],
    ['RECEBIMENTO PIX - 10000000000303 POUSADA EXEMPLO LTDA ME', 1500, 'income', null],
    ['PAGAMENTO PIX - 11122233344 JOAO TITULAR EXEMPLO', 80, 'expense', null],
  ] as const)('%s', async (desc, amount, type, expected) => {
    const s = await suggestCategory(desc, 'ent-pf', amount, CATS, type)
    expect(s.category_id).toBe(expected)
  })
})

describe('learnRule por entidade', () => {
  const desc = 'PAGAMENTO PIX - 10000000001111 TELEFONICA EXEMPLO'
  const pattern = 'pagamento pix 10000000001111 telefonica exemplo'

  it('grava com a entidade ativa', async () => {
    await learnRule(desc, 'telefonia', 'ent-pf')
    expect(fake.tables.category_rules).toEqual([
      expect.objectContaining({ entity_id: 'ent-pf', pattern, category_id: 'telefonia', confirm_count: 1 }),
    ])
  })

  it('herda as contagens da regra legada de mesma categoria, sem alterá-la', async () => {
    fake.tables.category_rules = [rule({ entity_id: null, pattern, category_id: 'telefonia', match_count: 4, confirm_count: 3 })]
    await learnRule(desc, 'telefonia', 'ent-pf')
    const [legacy, own] = fake.tables.category_rules
    expect(legacy).toMatchObject({ entity_id: null, confirm_count: 3, match_count: 4 })
    expect(own).toMatchObject({ entity_id: 'ent-pf', confirm_count: 4, match_count: 5 })
  })

  it('incrementa a regra da entidade e zera ao corrigir', async () => {
    fake.tables.category_rules = [rule({ entity_id: 'ent-pf', pattern, category_id: 'telefonia', match_count: 2, confirm_count: 2 })]
    await learnRule(desc, 'telefonia', 'ent-pf')
    expect(fake.tables.category_rules[0]).toMatchObject({ confirm_count: 3, match_count: 3 })
    await learnRule(desc, 'moradia', 'ent-pf')
    expect(fake.tables.category_rules[0]).toMatchObject({ category_id: 'moradia', confirm_count: 1, match_count: 1 })
  })
})
