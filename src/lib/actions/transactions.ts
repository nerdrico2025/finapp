'use server'

import { createHash, randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import type { TransactionType, TransactionStatus } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransactionFilters {
  month?: number
  year?: number
  type?: TransactionType | 'all'
  categoryId?: string
  accountId?: string
  page?: number
  pageSize?: number
}

export interface TransactionFormData {
  type: TransactionType
  amount: number
  date: string
  account_id: string
  category_id?: string | null
  description?: string | null
  notes?: string | null
  destination_account_id?: string | null
  transfer_amount?: number | null
  status?: TransactionStatus
  force?: boolean
}

export interface CSVRow {
  date: string
  description: string
  amount: number
  account_id: string
  category_id?: string | null
}

export type TransactionWithRelations = {
  id: string
  user_id: string
  account_id: string
  category_id: string | null
  type: TransactionType
  amount: number
  description: string | null
  notes: string | null
  date: string
  status: TransactionStatus
  recurring_rule_id: string | null
  destination_account_id: string | null
  transfer_amount: number | null
  transfer_pair_id: string | null
  is_mirror: boolean
  tags: string[] | null
  import_hash: string | null
  created_at: string
  updated_at: string
  account: { id: string; name: string; color: string | null } | null
  destination_account: { id: string; name: string; color: string | null } | null
  category: { id: string; name: string; icon: string | null; color: string | null } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateImportHash(userId: string, amount: number, date: string, description: string): string {
  return createHash('md5')
    .update(`${userId}|${amount}|${date}|${(description ?? '').toLowerCase().trim()}`)
    .digest('hex')
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function getTransactions(filters: TransactionFilters = {}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { data: null, count: 0, error: 'Não autenticado' }

  const entityId = await getActiveEntityId(supabase, user.id)

  const { month, year, type, categoryId, accountId, page = 1, pageSize = 20 } = filters

  const now = new Date()
  const filterYear = year ?? now.getFullYear()
  const filterMonth = month ?? now.getMonth() + 1

  const from = `${filterYear}-${String(filterMonth).padStart(2, '0')}-01`
  const nextMonth = filterMonth === 12 ? 1 : filterMonth + 1
  const nextYear = filterMonth === 12 ? filterYear + 1 : filterYear
  const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  const offset = (page - 1) * pageSize

  let query = supabase
    .from('transactions')
    .select(
      `*, account:accounts!account_id(id, name, color), destination_account:accounts!destination_account_id(id, name, color), category:categories(id, name, icon, color)`,
      { count: 'exact' }
    )
    .eq('user_id', user.id)
    .gte('date', from)
    .lt('date', to)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (entityId) query = query.eq('entity_id', entityId)
  if (type && type !== 'all') query = query.eq('type', type)
  if (categoryId) query = query.eq('category_id', categoryId)
  if (accountId) query = query.eq('account_id', accountId)

  const { data, count, error } = await query

  return {
    data: (data ?? []) as unknown as TransactionWithRelations[],
    count: count ?? 0,
    error: error?.message ?? null,
  }
}

export async function createTransaction(
  formData: TransactionFormData
): Promise<{ error: string | null; duplicate?: boolean; existingId?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Não autenticado' }

  const entityId = await getActiveEntityId(supabase, user.id)

  const importHash = generateImportHash(
    user.id,
    formData.amount,
    formData.date,
    formData.description ?? ''
  )

  if (!formData.force) {
    let isDuplicate = false
    let existingId: string | undefined

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'is_duplicate_transaction' as never,
      { p_user_id: user.id, p_import_hash: importHash } as never
    )

    if (!rpcError && rpcResult) {
      isDuplicate = true
    } else {
      const { data: existing } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', user.id)
        .eq('import_hash', importHash)
        .maybeSingle()

      if (existing) {
        isDuplicate = true
        existingId = existing.id
      }
    }

    if (isDuplicate) {
      return { error: null, duplicate: true, existingId }
    }
  }

  const { error } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      entity_id: entityId,
      account_id: formData.account_id,
      category_id: formData.category_id ?? null,
      type: formData.type,
      amount: formData.amount,
      description: formData.description ?? null,
      notes: formData.notes ?? null,
      date: formData.date,
      status: formData.status ?? 'completed',
      destination_account_id: formData.destination_account_id ?? null,
      transfer_amount: formData.transfer_amount ?? null,
      import_hash: importHash,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/transactions')
  revalidatePath('/accounts')
  revalidatePath('/dashboard')
  return { error: null }
}

export async function createTransfer(
  formData: TransactionFormData
): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Não autenticado' }
  if (!formData.destination_account_id) return { error: 'Conta de destino obrigatória' }
  if (formData.account_id === formData.destination_account_id) {
    return { error: 'Conta de origem e destino não podem ser iguais' }
  }

  const entityId = await getActiveEntityId(supabase, user.id)
  const pairId = randomUUID()
  const receivedAmount = formData.transfer_amount ?? formData.amount

  // Primary record — drives balance changes in trigger (is_mirror=false)
  const { error: e1 } = await supabase.from('transactions').insert({
    user_id: user.id,
    entity_id: entityId,
    account_id: formData.account_id,
    type: 'transfer',
    amount: formData.amount,
    date: formData.date,
    description: formData.description ?? null,
    destination_account_id: formData.destination_account_id,
    transfer_amount: formData.transfer_amount ?? null,
    transfer_pair_id: pairId,
    is_mirror: false,
    status: 'completed',
  })

  if (e1) return { error: e1.message }

  // Mirror record — display only for the destination account (is_mirror=true, no balance impact)
  const { error: e2 } = await supabase.from('transactions').insert({
    user_id: user.id,
    entity_id: entityId,
    account_id: formData.destination_account_id,
    type: 'transfer',
    amount: receivedAmount,
    date: formData.date,
    description: formData.description ?? null,
    destination_account_id: formData.account_id,
    transfer_pair_id: pairId,
    is_mirror: true,
    status: 'completed',
  })

  if (e2) {
    await supabase.from('transactions').delete()
      .eq('transfer_pair_id', pairId)
      .eq('user_id', user.id)
    return { error: e2.message }
  }

  revalidatePath('/transactions')
  revalidatePath('/accounts')
  revalidatePath('/dashboard')
  return { error: null }
}

export async function updateTransaction(
  id: string,
  formData: Partial<TransactionFormData>
): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Não autenticado' }

  const { data: original } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!original) return { error: 'Transação não encontrada' }

  const newType = formData.type ?? original.type
  const newAmount = formData.amount ?? original.amount
  const newAccountId = formData.account_id ?? original.account_id
  const newDestId = formData.destination_account_id ?? original.destination_account_id
  const newTransferAmount = formData.transfer_amount ?? original.transfer_amount

  const { error } = await supabase
    .from('transactions')
    .update({
      account_id: newAccountId,
      category_id: formData.category_id !== undefined ? formData.category_id : original.category_id,
      type: newType,
      amount: newAmount,
      description: formData.description !== undefined ? formData.description : original.description,
      notes: formData.notes !== undefined ? formData.notes : original.notes,
      date: formData.date ?? original.date,
      status: formData.status ?? original.status,
      destination_account_id: newDestId,
      transfer_amount: newTransferAmount,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/transactions')
  revalidatePath('/accounts')
  revalidatePath('/dashboard')
  return { error: null }
}

export async function deleteTransaction(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Não autenticado' }

  const { data: original } = await supabase
    .from('transactions')
    .select('transfer_pair_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!original) return { error: 'Transação não encontrada' }

  let deleteError
  if (original.transfer_pair_id) {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('transfer_pair_id', original.transfer_pair_id)
      .eq('user_id', user.id)
    deleteError = error
  } else {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    deleteError = error
  }

  if (deleteError) return { error: deleteError.message }

  revalidatePath('/transactions')
  revalidatePath('/accounts')
  revalidatePath('/dashboard')
  return { error: null }
}

export async function getTransactionSummary(filters: Pick<TransactionFilters, 'month' | 'year' | 'categoryId' | 'accountId'>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { totalIncome: 0, totalExpenses: 0, error: 'Não autenticado' }

  const entityId = await getActiveEntityId(supabase, user.id)

  const now = new Date()
  const filterYear = filters.year ?? now.getFullYear()
  const filterMonth = filters.month ?? now.getMonth() + 1
  const from = `${filterYear}-${String(filterMonth).padStart(2, '0')}-01`
  const nextMonth = filterMonth === 12 ? 1 : filterMonth + 1
  const nextYear = filterMonth === 12 ? filterYear + 1 : filterYear
  const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  let baseQuery = supabase
    .from('transactions')
    .select('type, amount')
    .eq('user_id', user.id)
    .eq('is_mirror', false)
    .gte('date', from)
    .lt('date', to)

  if (entityId) baseQuery = baseQuery.eq('entity_id', entityId)
  if (filters.categoryId) baseQuery = baseQuery.eq('category_id', filters.categoryId)
  if (filters.accountId) baseQuery = baseQuery.eq('account_id', filters.accountId)

  const { data, error } = await baseQuery

  if (error || !data) return { totalIncome: 0, totalExpenses: 0, error: error?.message ?? null }

  const totalIncome = data.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpenses = data.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  return { totalIncome, totalExpenses, error: null }
}

export async function importTransactions(rows: CSVRow[]): Promise<{
  inserted: number
  duplicates: number
  errors: number
  errorDetails: string[]
}> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { inserted: 0, duplicates: 0, errors: 1, errorDetails: ['Não autenticado'] }

  const entityId = await getActiveEntityId(supabase, user.id)

  let inserted = 0
  let duplicates = 0
  let errors = 0
  const errorDetails: string[] = []

  for (const row of rows) {
    try {
      const type: TransactionType = row.amount >= 0 ? 'income' : 'expense'
      const amount = Math.abs(row.amount)

      const importHash = generateImportHash(user.id, amount, row.date, row.description)

      const { data: existing } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', user.id)
        .eq('import_hash', importHash)
        .maybeSingle()

      if (existing) {
        duplicates++
        continue
      }

      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        entity_id: entityId,
        account_id: row.account_id,
        category_id: row.category_id ?? null,
        type,
        amount,
        description: row.description,
        date: row.date,
        status: 'completed' as const,
        import_hash: importHash,
      })

      if (error) {
        errors++
        errorDetails.push(`${row.date} ${row.description}: ${error.message}`)
        continue
      }

      inserted++
    } catch {
      errors++
      errorDetails.push(`${row.date} ${row.description}: erro inesperado`)
    }
  }

  if (inserted > 0) {
    revalidatePath('/transactions')
    revalidatePath('/accounts')
    revalidatePath('/dashboard')
  }

  return { inserted, duplicates, errors, errorDetails }
}
