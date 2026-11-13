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

// ─── Pares recusados no servidor ──────────────────────────────────────────────

describe('importTransactions — transferência recusada aparece no resumo', () => {
  it('conta destino de outra entidade: entra como receita/despesa e é listada com o motivo', async () => {
    fake.tables.accounts.push({ id: 'acc-pj', user_id: 'user-1', is_active: true, entity_id: 'entity-pj' })
    const res = await importTransactions([{
      ...line, description: 'PIX JOAO', account_id: 'acc-itau',
      transfer: { kind: 'createPair', counterpartAccountId: 'acc-pj' },
    }])
    expect(res).toMatchObject({ inserted: 1, transfers: 0 })
    expect(res.transferSkipped).toEqual([{
      date: line.date, description: 'PIX JOAO',
      reason: 'a conta destino está inativa ou não pertence à entidade ativa',
    }])
    expect(fake.tables.transactions[0]).toMatchObject({ type: 'expense', category_id: null })
  })

  it('contraparte que sumiu desde a prévia', async () => {
    const res = await importTransactions([{
      ...line, account_id: 'acc-itau', transfer: { kind: 'convert', existingId: 'nao-existe' },
    }])
    expect(res.transferSkipped).toHaveLength(1)
    expect(res.transferSkipped[0].reason).toMatch(/mudou ou foi removida/)
  })

  it('par vinculado não entra na lista', async () => {
    fake.tables.accounts.push({ id: 'acc-nubank', user_id: 'user-1', is_active: true, entity_id: 'entity-1' })
    const res = await importTransactions([{
      ...line, account_id: 'acc-itau', transfer: { kind: 'createPair', counterpartAccountId: 'acc-nubank' },
    }])
    expect(res).toMatchObject({ transfers: 1, transferSkipped: [] })
  })
})

// ─── Absorção com data diferente ──────────────────────────────────────────────

describe('importTransactions — absorção de perna pendente com data diferente', () => {
  function seedPendingLeg(date: string) {
    fake.tables.transactions.push(
      { id: 'leg-sic', user_id: 'user-1', entity_id: 'entity-1', account_id: 'acc-sicredi', type: 'transfer', amount: 1000, date,
        description: 'PAGAMENTO PIX - JOAO', transfer_pair_id: 'p1', is_mirror: false, destination_account_id: 'acc-btg',
        import_hash: 'h-sicredi', bank_transaction_id: null, transfer_status: 'pending' },
      { id: 'leg-btg', user_id: 'user-1', entity_id: 'entity-1', account_id: 'acc-btg', type: 'transfer', amount: 1000, date,
        description: 'PAGAMENTO PIX - JOAO', transfer_pair_id: 'p1', is_mirror: true, destination_account_id: 'acc-sicredi',
        import_hash: null, bank_transaction_id: null, transfer_status: 'pending' },
    )
  }

  it('3 dias: absorve, a perna do BTG passa para a data do extrato e o par é confirmado', async () => {
    seedPendingLeg('2026-11-03')
    const res = await importTransactions([{
      date: '2026-10-31', description: 'PIX RECEBIDO JOAO', amount: 1000, account_id: 'acc-btg',
      transfer: { kind: 'absorb', legId: 'leg-btg' },
    }])
    expect(res).toMatchObject({ absorbed: 1, inserted: 0, transferSkipped: [] })
    const legBtg = fake.tables.transactions.find(t => t.id === 'leg-btg')!
    const legSic = fake.tables.transactions.find(t => t.id === 'leg-sic')!
    expect(legBtg).toMatchObject({ date: '2026-10-31', transfer_status: 'matched' })
    expect(legBtg.import_hash).toBeTruthy()
    expect(legSic).toMatchObject({ date: '2026-11-03', transfer_status: 'matched' })
  })

  it('4 dias: o servidor recusa a absorção e a linha aparece no resumo', async () => {
    seedPendingLeg('2026-11-03')
    const res = await importTransactions([{
      date: '2026-10-30', description: 'PIX RECEBIDO JOAO', amount: 1000, account_id: 'acc-btg',
      transfer: { kind: 'absorb', legId: 'leg-btg' },
    }])
    expect(res).toMatchObject({ absorbed: 0, inserted: 1 })
    expect(res.transferSkipped).toHaveLength(1)
  })
})
