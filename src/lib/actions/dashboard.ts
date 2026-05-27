'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonthlySummary {
  income: number
  expenses: number
  balance: number
}

export interface CategorySpending {
  category_id: string
  name: string
  icon: string | null
  color: string | null
  amount: number
}

export interface MonthlyPoint {
  label: string
  month: number
  year: number
  income: number
  expenses: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function pad(n: number) { return String(n).padStart(2, '0') }

function monthRange(month: number, year: number) {
  const from = `${year}-${pad(month)}-01`
  const nm = month === 12 ? 1 : month + 1
  const ny = month === 12 ? year + 1 : year
  const to = `${ny}-${pad(nm)}-01`
  return { from, to }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function getMonthlySummary(month: number, year: number): Promise<MonthlySummary> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { income: 0, expenses: 0, balance: 0 }

  const entityId = await getActiveEntityId(supabase, user.id)

  const { from, to } = monthRange(month, year)

  let query = supabase
    .from('transactions')
    .select('type, amount')
    .eq('user_id', user.id)
    .in('type', ['income', 'expense'])
    .gte('date', from)
    .lt('date', to)

  if (entityId) query = query.eq('entity_id', entityId)

  const { data } = await query

  let income = 0
  let expenses = 0

  for (const tx of data ?? []) {
    if (tx.type === 'income') income += tx.amount
    else expenses += tx.amount
  }

  return { income, expenses, balance: income - expenses }
}

export async function getExpensesByCategory(month: number, year: number): Promise<CategorySpending[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const entityId = await getActiveEntityId(supabase, user.id)

  const { from, to } = monthRange(month, year)

  let query = supabase
    .from('transactions')
    .select('amount, category:categories(id, name, icon, color)')
    .eq('user_id', user.id)
    .eq('type', 'expense')
    .gte('date', from)
    .lt('date', to)

  if (entityId) query = query.eq('entity_id', entityId)

  const { data } = await query

  if (!data) return []

  const map = new Map<string, CategorySpending>()

  for (const tx of data as unknown as Array<{
    amount: number
    category: { id: string; name: string; icon: string | null; color: string | null } | null
  }>) {
    const cat = tx.category
    const key = cat?.id ?? '__none__'
    const existing = map.get(key)
    if (existing) {
      existing.amount += tx.amount
    } else {
      map.set(key, {
        category_id: cat?.id ?? '',
        name: cat?.name ?? 'Sem categoria',
        icon: cat?.icon ?? null,
        color: cat?.color ?? '#94a3b8',
        amount: tx.amount,
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => b.amount - a.amount)
}

export async function getIncomeByCategory(month: number, year: number): Promise<CategorySpending[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const entityId = await getActiveEntityId(supabase, user.id)

  const { from, to } = monthRange(month, year)

  let query = supabase
    .from('transactions')
    .select('amount, category:categories(id, name, icon, color)')
    .eq('user_id', user.id)
    .eq('type', 'income')
    .gte('date', from)
    .lt('date', to)

  if (entityId) query = query.eq('entity_id', entityId)

  const { data } = await query

  if (!data) return []

  const map = new Map<string, CategorySpending>()

  for (const tx of data as unknown as Array<{
    amount: number
    category: { id: string; name: string; icon: string | null; color: string | null } | null
  }>) {
    const cat = tx.category
    const key = cat?.id ?? '__none__'
    const existing = map.get(key)
    if (existing) {
      existing.amount += tx.amount
    } else {
      map.set(key, {
        category_id: cat?.id ?? '',
        name: cat?.name ?? 'Sem categoria',
        icon: cat?.icon ?? null,
        color: cat?.color ?? '#94a3b8',
        amount: tx.amount,
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => b.amount - a.amount)
}

export async function getMonthlyOverview(): Promise<MonthlyPoint[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const entityId = await getActiveEntityId(supabase, user.id)

  const now = new Date()
  const points: MonthlyPoint[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    points.push({
      label: MONTH_LABELS[d.getMonth()],
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      income: 0,
      expenses: 0,
    })
  }

  const oldest = points[0]
  const from = `${oldest.year}-${pad(oldest.month)}-01`
  const last = points[points.length - 1]
  const { to } = monthRange(last.month, last.year)

  let query = supabase
    .from('transactions')
    .select('type, amount, date')
    .eq('user_id', user.id)
    .in('type', ['income', 'expense'])
    .gte('date', from)
    .lt('date', to)

  if (entityId) query = query.eq('entity_id', entityId)

  const { data } = await query

  for (const tx of data ?? []) {
    const txMonth = parseInt(tx.date.slice(5, 7))
    const txYear  = parseInt(tx.date.slice(0, 4))
    const point = points.find((p) => p.month === txMonth && p.year === txYear)
    if (!point) continue
    if (tx.type === 'income') point.income += tx.amount
    else point.expenses += tx.amount
  }

  return points
}
