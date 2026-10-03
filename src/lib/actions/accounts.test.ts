import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeSupabase } from '@/test/fake-supabase'

let fake = createFakeSupabase()
let maxAccounts: number | null = null

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }))
vi.mock('@/lib/entity', () => ({ getActiveEntityId: async () => 'entity-1' }))
vi.mock('@/lib/plan-server', () => ({ getUserPlanLimits: async () => ({ maxAccounts }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { deleteAccount, setAccountActive, getAccountUsage } from './accounts'

const account = (id: string, name: string, is_active = true) =>
  ({ id, name, user_id: 'user-1', entity_id: 'entity-1', is_active, type: 'checking', balance: 0, include_in_total: true })

const tx = (account_id: string, extra: Record<string, unknown> = {}) =>
  ({ id: `t-${Math.random()}`, user_id: 'user-1', account_id, destination_account_id: null, is_mirror: false, ...extra })

beforeEach(() => {
  fake = createFakeSupabase()
  maxAccounts = null
  fake.tables.accounts.push(account('itau', 'Itaú'), account('nubank', 'Nubank'))
})

describe('deleteAccount', () => {
  it('bloqueia conta com movimentação e devolve as quantidades, sem apagar', async () => {
    fake.tables.transactions.push(tx('nubank'), tx('nubank'))
    // Transferência de Itaú para Nubank: principal no Itaú, espelho no Nubank.
    fake.tables.transactions.push(tx('itau', { destination_account_id: 'nubank' }))

    const res = await deleteAccount('nubank')
    expect(res.error).toBe(
      'Não é possível excluir "Nubank": ela tem 2 transações e 1 transferência recebida de outra conta. ' +
      'Inative a conta para tirá-la das listas sem perder o histórico.',
    )
    expect(fake.tables.accounts.map(a => a.id)).toContain('nubank')
  })

  it('bloqueia conta que só aparece como destino de transferência', async () => {
    fake.tables.transactions.push(tx('itau', { destination_account_id: 'nubank' }))
    const res = await deleteAccount('nubank')
    expect(res.error).toContain('1 transferência recebida de outra conta')
    expect(fake.tables.accounts.map(a => a.id)).toContain('nubank')
  })

  it('exclui conta sem nenhuma movimentação', async () => {
    fake.tables.transactions.push(tx('itau'))
    const res = await deleteAccount('nubank')
    expect(res).toEqual({ error: null })
    expect(fake.tables.accounts.map(a => a.id)).toEqual(['itau'])
  })

  it('não exclui conta de outro usuário', async () => {
    fake.tables.accounts.push({ ...account('alheia', 'Alheia'), user_id: 'user-2' })
    const res = await deleteAccount('alheia')
    expect(res.error).toBe('Conta não encontrada')
    expect(fake.tables.accounts.map(a => a.id)).toContain('alheia')
  })

  it('getAccountUsage conta transações e transferências recebidas', async () => {
    fake.tables.transactions.push(tx('nubank', { is_mirror: true, destination_account_id: 'itau' }))
    fake.tables.transactions.push(tx('itau', { destination_account_id: 'nubank' }))
    const { usage } = await getAccountUsage('nubank')
    expect(usage).toEqual({ transactions: 1, incomingTransfers: 1, otherReferences: 0 })
  })
})

describe('setAccountActive', () => {
  it('inativa e reativa a conta', async () => {
    expect(await setAccountActive('nubank', false)).toEqual({ error: null })
    expect(fake.tables.accounts.find(a => a.id === 'nubank')!.is_active).toBe(false)

    expect(await setAccountActive('nubank', true)).toEqual({ error: null })
    expect(fake.tables.accounts.find(a => a.id === 'nubank')!.is_active).toBe(true)
  })

  it('reativar respeita o limite de contas do plano', async () => {
    maxAccounts = 2
    fake.tables.accounts.push(account('velha', 'Velha', false))
    const res = await setAccountActive('velha', true)
    expect(res.error).toBe('LIMIT_REACHED')
    expect(fake.tables.accounts.find(a => a.id === 'velha')!.is_active).toBe(false)
  })

  it('não altera conta de outro usuário', async () => {
    fake.tables.accounts.push({ ...account('alheia', 'Alheia'), user_id: 'user-2' })
    expect((await setAccountActive('alheia', false)).error).toBe('Conta não encontrada')
  })
})
