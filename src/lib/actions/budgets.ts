'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
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

  const { data: rawBudgets, error: budgetsError } = await supabase
    .from('budgets')
    .select(`
      *,
      category:categories(id, name, icon, color)
    `)
    .eq('user_id', user.id)
    .order('amount', { ascending: false })

  if (budgetsError) return { data: null, error: budgetsError.message }
  if (!rawBudgets || rawBudgets.length === 0) return { data: [] as BudgetWithSpending[], error: null }

  const pad = (n: number) => String(n).padStart(2, '0')
  const periodStart = `${year}-${pad(month)}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const periodEnd = `${year}-${pad(month)}-${lastDay}`

  const { data: transactions } = await supabase
    .from('transactions')
    .select('category_id, amount')
    .eq('user_id', user.id)
    .eq('type', 'expense')
    .gte('date', periodStart)
    .lte('date', periodEnd)

  const spentByCategory = new Map<string, number>()
  for (const tx of transactions ?? []) {
    if (tx.category_id) {
      spentByCategory.set(tx.category_id, (spentByCategory.get(tx.category_id) ?? 0) + tx.amount)
    }
  }

  const enriched = (rawBudgets as unknown as BudgetWithSpending[]).map((budget) => {
    const spent = spentByCategory.get(budget.category_id) ?? 0
    const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0
    return { ...budget, spent, percentage }
  })

  return { data: enriched, error: null }
}

export async function createBudget(formData: BudgetFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  const periodStart = `${year}-${pad(month)}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const periodEnd = `${year}-${pad(month)}-${lastDay}`

  const { error } = await supabase.from('budgets').insert({
    user_id: user.id,
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
