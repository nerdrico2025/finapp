import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase falso, só com o que importTransactions usa nas linhas comuns ────

type Row = Record<string, unknown>
let table: Row[] = []

function query() {
  const filters: [string, unknown][] = []
  const rows = () => table.filter(r => filters.every(([k, v]) => r[k] === v))
  const builder = {
    select: () => builder,
    eq: (k: string, v: unknown) => { filters.push([k, v]); return builder },
    limit: () => builder,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    insert: async (row: Row) => { table.push({ id: `tx-${table.length + 1}`, ...row }); return { error: null } },
  }
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => query(),
  }),
}))
vi.mock('@/lib/entity', () => ({ getActiveEntityId: async () => 'entity-1' }))
vi.mock('@/lib/plan-server', () => ({ getUserPlanLimits: async () => ({}) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { importTransactions } = await import('./transactions')

beforeEach(() => { table = [] })

describe('importTransactions — deduplicação por import_hash', () => {
  const line = { date: '2026-09-10', description: 'PIX FULANO', amount: -150 }

  it('mesma descrição, valor e data em duas contas diferentes: as duas linhas são importadas', async () => {
    const a = await importTransactions([{ ...line, account_id: 'acc-itau' }])
    const b = await importTransactions([{ ...line, account_id: 'acc-nubank' }])

    expect(a).toMatchObject({ inserted: 1, duplicates: 0 })
    expect(b).toMatchObject({ inserted: 1, duplicates: 0 })
    expect(table.map(r => r.account_id)).toEqual(['acc-itau', 'acc-nubank'])
    // O cálculo do hash não muda: as duas linhas têm o mesmo hash.
    expect(table[0].import_hash).toBe(table[1].import_hash)
  })

  it('reimportar na mesma conta continua sendo duplicata', async () => {
    await importTransactions([{ ...line, account_id: 'acc-itau' }])
    const again = await importTransactions([{ ...line, account_id: 'acc-itau' }])
    expect(again).toMatchObject({ inserted: 0, duplicates: 1 })
    expect(table).toHaveLength(1)
  })
})
