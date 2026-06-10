'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import { getUserPlanLimits } from '@/lib/plan'
import type { AccountType } from '@/types'

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

export async function getTotalBalance() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { total: 0, error: 'Não autenticado' }

  const entityId = await getActiveEntityId(supabase, user.id)

  let query = supabase
    .from('accounts')
    .select('balance, include_in_total')
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (entityId) query = query.eq('entity_id', entityId)

  const { data, error } = await query

  if (error || !data) return { total: 0, error: error?.message ?? null }

  const total = data
    .filter((a) => a.include_in_total)
    .reduce((sum, a) => sum + (a.balance ?? 0), 0)

  return { total, error: null }
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

export async function deleteAccount(id: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Não autenticado' }

  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', id)

  if (count && count > 0) {
    return { error: 'Não é possível excluir uma conta com transações vinculadas.' }
  }

  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/accounts')
  return { error: null }
}
