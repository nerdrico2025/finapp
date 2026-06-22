'use server'

import { createHash, randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import { getUserPlanLimits } from '@/lib/plan-server'
import {
  scoreDuplicate,
  isDuplicateCandidate,
  addDays,
  DUP_DATE_WINDOW_DAYS,
  DUP_SCORE_THRESHOLD,
  type DuplicateMatch,
  type ScoreInput,
} from '@/lib/duplicate-detection'
import type { TransactionType, TransactionStatus } from '@/types'

export type { DuplicateMatch } from '@/lib/duplicate-detection'

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

// Loose shape for rows returned by the candidate query below.
type CandidateRow = {
  id: string
  date: string
  amount: number
  description: string | null
  type: string
  category_id: string | null
  category: { name: string } | { name: string }[] | null
}

function categoryName(row: CandidateRow): string | null {
  const c = row.category
  if (!c) return null
  return Array.isArray(c) ? (c[0]?.name ?? null) : c.name
}

/**
 * Find already-saved transactions that look like duplicates of `input`,
 * ranked by score. Only rows with the same value and within the date window
 * are queried; the fuzzy score decides which cross the threshold.
 */
async function findDuplicateMatches(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  entityId: string | null,
  input: ScoreInput
): Promise<DuplicateMatch[]> {
  let query = supabase
    .from('transactions')
    .select('id, date, amount, description, type, category_id, category:categories(name)')
    .eq('user_id', userId)
    .eq('type', input.type)
    .eq('is_mirror', false)
    .eq('amount', Math.abs(input.amount))
    .gte('date', addDays(input.date, -DUP_DATE_WINDOW_DAYS))
    .lte('date', addDays(input.date, DUP_DATE_WINDOW_DAYS))

  if (entityId) query = query.eq('entity_id', entityId)

  const { data } = await query
  const rows = (data ?? []) as unknown as CandidateRow[]

  const matches: DuplicateMatch[] = []
  for (const row of rows) {
    const { score, reasons } = scoreDuplicate(input, {
      type: row.type,
      amount: row.amount,
      date: row.date,
      description: row.description,
      categoryId: row.category_id,
    })
    if (score >= DUP_SCORE_THRESHOLD) {
      matches.push({
        id: row.id,
        source: 'existing',
        date: row.date,
        amount: row.amount,
        description: row.description,
        categoryName: categoryName(row),
        score,
        reasons,
      })
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, 5)
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function getMonthlyTransactionCount(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]
  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('date', monthStart)
    .lt('date', nextMonth)
  return count ?? 0
}

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
): Promise<{
  error: string | null
  duplicate?: boolean
  duplicateMatches?: DuplicateMatch[]
  feature?: string
  message?: string
}> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Não autenticado' }

  const limits = await getUserPlanLimits(user.id)
  if (limits.maxTransactionsPerMonth !== null) {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]
    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('date', monthStart)
      .lt('date', nextMonth)
    if ((count ?? 0) >= limits.maxTransactionsPerMonth) {
      return {
        error: 'LIMIT_REACHED',
        feature: 'transactions',
        message: 'Você atingiu o limite de 30 transações do plano gratuito.',
      }
    }
  }

  const entityId = await getActiveEntityId(supabase, user.id)

  const importHash = generateImportHash(
    user.id,
    formData.amount,
    formData.date,
    formData.description ?? ''
  )

  if (!formData.force && formData.type !== 'transfer') {
    const matches = await findDuplicateMatches(supabase, user.id, entityId, {
      type: formData.type,
      amount: formData.amount,
      date: formData.date,
      description: formData.description ?? null,
      categoryId: formData.category_id ?? null,
    })

    if (matches.length > 0) {
      return { error: null, duplicate: true, duplicateMatches: matches }
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

export interface ImportDupInput {
  date: string
  description: string
  amount: number // signed: negative = expense, positive = income
  categoryId?: string | null
}

/**
 * For each row about to be imported, find a likely duplicate — either an
 * already-saved transaction or an earlier row in the same file. Returns an
 * array aligned by index with the input (null where no duplicate is suspected),
 * so the UI can ask the user to confirm before importing.
 */
export async function findImportDuplicates(
  rows: ImportDupInput[]
): Promise<(DuplicateMatch | null)[]> {
  const result: (DuplicateMatch | null)[] = rows.map(() => null)
  if (rows.length === 0) return result

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return result

  const entityId = await getActiveEntityId(supabase, user.id)

  const valid = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.date && Number.isFinite(r.amount) && r.amount !== 0)

  if (valid.length === 0) return result

  // Pull every existing transaction inside the overall date window once,
  // then score in memory — far cheaper than a query per row.
  const dates = valid.map(({ r }) => r.date).sort()
  const from = addDays(dates[0], -DUP_DATE_WINDOW_DAYS)
  const to = addDays(dates[dates.length - 1], DUP_DATE_WINDOW_DAYS)

  let query = supabase
    .from('transactions')
    .select('id, date, amount, description, type, category_id, category:categories(name)')
    .eq('user_id', user.id)
    .eq('is_mirror', false)
    .gte('date', from)
    .lte('date', to)
  if (entityId) query = query.eq('entity_id', entityId)

  const { data } = await query
  const existing = (data ?? []) as unknown as CandidateRow[]

  for (const { r, i } of valid) {
    const input: ScoreInput = {
      type: r.amount >= 0 ? 'income' : 'expense',
      amount: r.amount,
      date: r.date,
      description: r.description,
      categoryId: r.categoryId ?? null,
    }

    // 1. Best match among already-saved transactions.
    let best: DuplicateMatch | null = null
    for (const row of existing) {
      const { score, reasons } = scoreDuplicate(input, {
        type: row.type,
        amount: row.amount,
        date: row.date,
        description: row.description,
        categoryId: row.category_id,
      })
      if (score >= DUP_SCORE_THRESHOLD && (!best || score > best.score)) {
        best = {
          id: row.id,
          source: 'existing',
          date: row.date,
          amount: row.amount,
          description: row.description,
          categoryName: categoryName(row),
          score,
          reasons,
        }
      }
    }

    // 2. Otherwise, an earlier row in this same file (repeated line).
    if (!best) {
      for (const { r: prev, i: j } of valid) {
        if (j >= i) break
        if (isDuplicateCandidate(input, {
          type: prev.amount >= 0 ? 'income' : 'expense',
          amount: prev.amount,
          date: prev.date,
          description: prev.description,
          categoryId: prev.categoryId ?? null,
        })) {
          const { reasons, score } = scoreDuplicate(input, {
            type: prev.amount >= 0 ? 'income' : 'expense',
            amount: prev.amount,
            date: prev.date,
            description: prev.description,
            categoryId: prev.categoryId ?? null,
          })
          best = {
            id: `file:${j}`,
            source: 'file',
            date: prev.date,
            amount: Math.abs(prev.amount),
            description: prev.description,
            categoryName: null,
            score,
            reasons: ['Repetida no arquivo', ...reasons],
          }
          break
        }
      }
    }

    result[i] = best
  }

  return result
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
