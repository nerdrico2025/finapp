'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import { getUserPlanLimits } from '@/lib/plan-server'
import type { AccountType } from '@/types'
import { computeTotalBalance } from '@/lib/accounts/balance'
import { deletionBlockMessage, type AccountUsage } from '@/lib/accounts/usage'

export interface AccountFormData {
  name: string
  type: AccountType
  color: string
  initial_balance: number
  include_in_total: boolean
}

export async function getAccounts() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { data: null, error: 'Não autenticado' }

  const entityId = await getActiveEntityId(supabase, user.id)

  let query = supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('name')

  if (entityId) query = query.eq('entity_id', entityId)

  const { data, error } = await query

  return { data, error: error?.message ?? null }
}

/**
 * Contas inativas da entidade ativa — só para a seção "Contas inativas" de
 * /accounts. getAccounts continua trazendo apenas as ativas, que é o que os
 * selects de lançamento, transferência e importação usam.
 */
export async function getInactiveAccounts() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { data: null, error: 'Não autenticado' }

  const entityId = await getActiveEntityId(supabase, user.id)

  let query = supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', false)
    .order('name')

  if (entityId) query = query.eq('entity_id', entityId)

  const { data, error } = await query

  return { data, error: error?.message ?? null }
}

export async function getTotalBalance() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { total: 0, error: 'Não autenticado' }

  const entityId = await getActiveEntityId(supabase, user.id)

  let query = supabase
    .from('accounts')
    .select('type, balance, include_in_total, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (entityId) query = query.eq('entity_id', entityId)

  const { data, error } = await query

  if (error || !data) return { total: 0, error: error?.message ?? null }

  return { total: computeTotalBalance(data), error: null }
}

export async function createAccount(formData: AccountFormData): Promise<{ error: string | null; feature?: string; message?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Não autenticado' }

  const limits = await getUserPlanLimits(user.id)
  if (limits.maxAccounts !== null) {
    const { count } = await supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true)
    if ((count ?? 0) >= limits.maxAccounts) {
      return {
        error: 'LIMIT_REACHED',
        feature: 'accounts',
        message: 'Você atingiu o limite de 2 contas do plano gratuito.',
      }
    }
  }

  const entityId = await getActiveEntityId(supabase, user.id)

  const { error } = await supabase.from('accounts').insert({
    user_id: user.id,
    entity_id: entityId,
    name: formData.name,
    type: formData.type,
    color: formData.color,
    initial_balance: formData.initial_balance,
    balance: formData.initial_balance,
    include_in_total: formData.include_in_total,
    is_active: true,
  })

  if (error) return { error: error.message }

  revalidatePath('/accounts')
  return { error: null }
}

export async function updateAccount(id: string, formData: Partial<AccountFormData>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('accounts')
    .update({
      name: formData.name,
      type: formData.type,
      color: formData.color,
      include_in_total: formData.include_in_total,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/accounts')
  return { error: null }
}

async function countRefs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  column: 'account_id' | 'destination_account_id',
  accountId: string,
  isMirror?: boolean,
): Promise<number> {
  let q = supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq(column, accountId)
  if (column === 'destination_account_id') q = q.neq('account_id', accountId)
  if (isMirror !== undefined) q = q.eq('is_mirror', isMirror)
  const { count } = await q
  return count ?? 0
}

/**
 * Movimentação da conta (transações dela e transferências em que é destino).
 * Não filtra por user_id de propósito: numa entidade compartilhada, outros
 * membros podem ter lançado na conta, e o banco (FK NO ACTION) recusaria a
 * exclusão do mesmo jeito. O RLS limita ao que o usuário enxerga.
 */
export async function getAccountUsage(id: string): Promise<{ usage: AccountUsage | null; error: string | null }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { usage: null, error: 'Não autenticado' }

  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!account) return { usage: null, error: 'Conta não encontrada' }

  const [transactions, incomingTransfers, otherReferences] = await Promise.all([
    countRefs(supabase, 'account_id', id),
    countRefs(supabase, 'destination_account_id', id, false),
    countRefs(supabase, 'destination_account_id', id, true),
  ])

  return { usage: { transactions, incomingTransfers, otherReferences }, error: null }
}

/**
 * Exclui a conta só se ela não tiver nenhuma movimentação. Com movimentação,
 * devolve a mensagem com as quantidades — a saída é inativar (setAccountActive).
 */
export async function deleteAccount(id: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Não autenticado' }

  const { data: account } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!account) return { error: 'Conta não encontrada' }

  const { usage, error: usageError } = await getAccountUsage(id)
  if (!usage) return { error: usageError ?? 'Não foi possível verificar a conta' }

  const blocked = deletionBlockMessage(account.name, usage)
  if (blocked) return { error: blocked }

  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  // 23503 (FK): uma transação entrou na conta entre a contagem e a exclusão.
  if (error?.code === '23503') {
    return { error: `Não é possível excluir "${account.name}": ela passou a ter transações. Inative a conta.` }
  }
  if (error) return { error: error.message }

  revalidatePath('/accounts')
  return { error: null }
}

/**
 * Inativa ou reativa a conta. Inativa: sai das listas, dos selects, do Saldo
 * total e dos candidatos de transferência; o histórico continua visível.
 * Reativar respeita o limite de contas do plano (que conta só as ativas).
 */
export async function setAccountActive(
  id: string,
  active: boolean,
): Promise<{ error: string | null; feature?: string; message?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Não autenticado' }

  if (active) {
    const limits = await getUserPlanLimits(user.id)
    if (limits.maxAccounts !== null) {
      const { count } = await supabase
        .from('accounts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_active', true)
      if ((count ?? 0) >= limits.maxAccounts) {
        return {
          error: 'LIMIT_REACHED',
          feature: 'accounts',
          message: 'Você atingiu o limite de 2 contas do plano gratuito.',
        }
      }
    }
  }

  const { data, error } = await supabase
    .from('accounts')
    .update({ is_active: active })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Conta não encontrada' }

  revalidatePath('/accounts')
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  return { error: null }
}
