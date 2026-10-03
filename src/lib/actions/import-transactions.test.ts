import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase, UNIQUE_ERROR } from '@/test/fake-supabase'

let fake = createFakeSupabase()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }))
vi.mock('@/lib/entity', () => ({ getActiveEntityId: async () => 'entity-1' }))
vi.mock('@/lib/plan-server', () => ({ getUserPlanLimits: async () => ({ maxTransactionsPerMonth: null }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { importTransactions, createTransaction } from './transactions'
import { applyImportTransfer } from '@/lib/import/transfer-writes'

beforeEach(() => { fake = createFakeSupabase() })

const line = { date: '2026-09-10', description: 'PIX FULANO', amount: -150 }

// ─── Deduplicação por hash na conta ───────────────────────────────────────────

describe('importTransactions — deduplicação por import_hash', () => {
  it('mesma descrição, valor e data em duas contas diferentes: as duas linhas são importadas', async () => {
    const a = await importTransactions([{ ...line, account_id: 'acc-itau' }])
    const b = await importTransactions([{ ...line, account_id: 'acc-nubank' }])

    expect(a).toMatchObject({ inserted: 1, duplicates: 0 })
    expect(b).toMatchObject({ inserted: 1, duplicates: 0 })
    const rows = fake.tables.transactions
    expect(rows.map(r => r.account_id)).toEqual(['acc-itau', 'acc-nubank'])
    // O cálculo do hash não muda: as duas linhas têm o mesmo hash.
    expect(rows[0].import_hash).toBe(rows[1].import_hash)
  })

  it('reimportar na mesma conta continua sendo duplicata', async () => {
    await importTransactions([{ ...line, account_id: 'acc-itau' }])
    const again = await importTransactions([{ ...line, account_id: 'acc-itau' }])
    expect(again).toMatchObject({ inserted: 0, duplicates: 1 })
    expect(fake.tables.transactions).toHaveLength(1)
  })
})

// ─── 23505 ────────────────────────────────────────────────────────────────────

describe('violação de unicidade (23505)', () => {
  it('importação, linha comum: 23505 no insert conta como duplicata, não como erro', async () => {
    fake = createFakeSupabase({ failInsert: () => UNIQUE_ERROR })
    const res = await importTransactions([{ ...line, account_id: 'acc-itau' }])
    expect(res).toMatchObject({ inserted: 0, duplicates: 1, errors: 0, errorDetails: [] })
  })

  it('perna de transferência: 23505 conta como já importada e desfaz a escrita parcial do par', async () => {
    // Segundo insert do par (a perna da outra conta) falha.
    fake = createFakeSupabase({ failInsert: (_row, n) => (n === 2 ? UNIQUE_ERROR : null) })
    fake.tables.accounts.push({ id: 'acc-nubank', user_id: 'user-1', is_active: true, entity_id: 'entity-1' })

    const res = await applyImportTransfer(
      fake.client as unknown as SupabaseClient, 'user-1', 'entity-1',
      { accountId: 'acc-itau', date: line.date, description: 'TED Nubank', amount: -150, importHash: 'h1', bankTransactionId: null },
      { kind: 'createPair', counterpartAccountId: 'acc-nubank' },
      () => 'pair-1',
    )

    expect(res).toEqual({ result: 'duplicate', error: null })
    expect(fake.inserts).toHaveLength(2)
    expect(fake.tables.transactions).toHaveLength(0) // primeira perna removida no rollback
  })

  it('importação com perna de transferência: o 23505 vira duplicata no resultado', async () => {
    fake = createFakeSupabase({ failInsert: (_row, n) => (n === 2 ? UNIQUE_ERROR : null) })
    fake.tables.accounts.push({ id: 'acc-nubank', user_id: 'user-1', is_active: true, entity_id: 'entity-1' })

    const res = await importTransactions([{
      ...line, description: 'TED Nubank', account_id: 'acc-itau',
      transfer: { kind: 'createPair', counterpartAccountId: 'acc-nubank' },
    }])

    expect(res).toMatchObject({ inserted: 0, transfers: 0, duplicates: 1, errors: 0 })
    expect(fake.tables.transactions).toHaveLength(0)
  })

  const form = { type: 'expense' as const, amount: 150, date: line.date, account_id: 'acc-itau', description: 'PIX FULANO' }

  it('createTransaction confirmado: 23505 → repete uma vez sem import_hash', async () => {
    fake = createFakeSupabase({ failInsert: row => (row.import_hash ? UNIQUE_ERROR : null) })
    const res = await createTransaction({ ...form, force: true })

    expect(res).toEqual({ error: null })
    expect(fake.inserts).toHaveLength(2)
    expect(fake.inserts[0].import_hash).toBeTruthy()
    expect(fake.inserts[1].import_hash).toBeNull()
    expect(fake.tables.transactions).toHaveLength(1)
  })

  it('createTransaction confirmado: se a repetição também falhar, devolve mensagem amigável, nunca a do Postgres', async () => {
    fake = createFakeSupabase({ failInsert: () => UNIQUE_ERROR })
    const res = await createTransaction({ ...form, force: true })

    expect(fake.inserts).toHaveLength(2)
    expect(res.error).toBe('Não foi possível salvar a transação: já existe um lançamento igual nesta conta.')
    expect(res.error).not.toContain('duplicate key')
  })

  it('createTransaction sem confirmação: sem repetição, e mensagem amigável em vez da do Postgres', async () => {
    fake = createFakeSupabase({ failInsert: () => UNIQUE_ERROR })
    const res = await createTransaction(form)

    expect(fake.inserts).toHaveLength(1)
    expect(res.error).toBe('Não foi possível salvar a transação: já existe um lançamento igual nesta conta.')
    expect(res.error).not.toContain('duplicate key')
  })
})
