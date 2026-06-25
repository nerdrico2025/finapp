'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import type { Budget } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BudgetFormData {
  category_id: string
  name: string
  amount: number
}

export type BudgetWithSpending = Omit<Budget, 'spent'> & {
  category: { id: string; name: string; icon: string | null; color: string | null } | null
  spent: number
  percentage: number
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function getBudgetsWithSpending(month: number, year: number) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Não autenticado' }

  const entityId = await getActiveEntityId(supabase, user.id)

  let budgetQuery = supabase
    .from('budgets')
    .select(`*, category:categories(id, name, icon, color)`)
    .eq('user_id', user.id)
    .order('amount', { ascending: false })

  if (entityId) budgetQuery = budgetQuery.eq('entity_id', entityId)

  const { data: rawBudgets, error: budgetsError } = await budgetQuery

  if (budgetsError) return { data: null, error: budgetsError.message }
  if (!rawBudgets || rawBudgets.length === 0) return { data: [] as BudgetWithSpending[], error: null }

  const pad = (n: number) => String(n).padStart(2, '0')
  const periodStart = `${year}-${pad(month)}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const periodEnd = `${year}-${pad(month)}-${lastDay}`

  let txQuery = supabase
    .from('transactions')
    .select('category_id, amount')
    .eq('user_id', user.id)
    .eq('type', 'expense')
    .gte('date', periodStart)
    .lte('date', periodEnd)

  if (entityId) txQuery = txQuery.eq('entity_id', entityId)

  const { data: transactions } = await txQuery

  // A budget on a parent category should absorb spending from its descendant
  // subcategories at ANY depth (e.g. Financiamento › Imobiliário › Apartamento).
  const budgetedCategoryIds = new Set(rawBudgets.map((b) => b.category_id))

  // Fetch the full category tree (id → parent_id) so we can walk ancestry chains.
  // RLS already scopes this to the current user; no extra entity filter needed.
  const categoryParentMap = new Map<string, string | null>()
  const { data: cats } = await supabase
    .from('categories')
    .select('id, parent_id')
    .eq('user_id', user.id)
  for (const c of (cats ?? []) as { id: string; parent_id: string | null }[]) {
    categoryParentMap.set(c.id, c.parent_id)
  }

  // Resolve a transaction's category to the nearest budgeted category, walking
  // up the parent chain. Checking the category itself first means a subcategory
  // with its OWN budget is charged to itself — the parent never double counts it.
  const resolveBudgetCategory = (categoryId: string): string | null => {
    let current: string | null = categoryId
    const seen = new Set<string>() // guard against cyclical parent links
    while (current && !seen.has(current)) {
      if (budgetedCategoryIds.has(current)) return current
      seen.add(current)
      current = categoryParentMap.get(current) ?? null
    }
    return null
  }

  // For each transaction decide which budget category to charge
  const spentByBudgetCategory = new Map<string, number>()
  for (const tx of transactions ?? []) {
    if (!tx.category_id) continue
    const chargeId = resolveBudgetCategory(tx.category_id)
    if (chargeId) {
      spentByBudgetCategory.set(chargeId, (spentByBudgetCategory.get(chargeId) ?? 0) + tx.amount)
    }
  }

  const enriched = (rawBudgets as unknown as BudgetWithSpending[]).map((budget) => {
    const spent = spentByBudgetCategory.get(budget.category_id) ?? 0
    const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0
    return { ...budget, spent, percentage }
  })

  return { data: enriched, error: null }
}

export async function createBudget(formData: BudgetFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const entityId = await getActiveEntityId(supabase, user.id)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  const periodStart = `${year}-${pad(month)}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const periodEnd = `${year}-${pad(month)}-${lastDay}`

  const { error } = await supabase.from('budgets').insert({
    user_id: user.id,
    entity_id: entityId,
    category_id: formData.category_id,
    name: formData.name,
    amount: formData.amount,
    period_start: periodStart,
    period_end: periodEnd,
    is_recurring: true,
    recurrence_frequency: 'monthly',
    spent: 0,
  })

  if (error) return { error: error.message }
  revalidatePath('/budgets')
  return { error: null }
}

export async function updateBudget(id: string, formData: Partial<BudgetFormData>) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('budgets')
    .update({
      ...(formData.category_id !== undefined && { category_id: formData.category_id }),
      ...(formData.name        !== undefined && { name: formData.name }),
      ...(formData.amount      !== undefined && { amount: formData.amount }),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/budgets')
  return { error: null }
}

export async function deleteBudget(id: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/budgets')
  return { error: null }
}
