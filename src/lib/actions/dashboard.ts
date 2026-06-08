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
  children?: Array<{ category_id: string; name: string; icon: string | null; color: string | null; amount: number }>
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

type RawCat = { id: string; name: string; icon: string | null; color: string | null; parent_id: string | null }

async function groupByParent(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  data: Array<{ amount: number; category: RawCat | null }>,
): Promise<CategorySpending[]> {
  // Collect parent IDs that we need to look up
  const parentIds = new Set<string>()
  for (const tx of data) {
    if (tx.category?.parent_id) parentIds.add(tx.category.parent_id)
  }

  const parentMap = new Map<string, RawCat>()
  if (parentIds.size > 0) {
    const { data: parents } = await supabase
      .from('categories')
      .select('id, name, icon, color, parent_id')
      .in('id', Array.from(parentIds))
    for (const p of (parents ?? []) as RawCat[]) parentMap.set(p.id, p)
  }

  // Two-pass aggregation: sub-level and parent-level
  type SubEntry = { category_id: string; name: string; icon: string | null; color: string | null; amount: number }
  const parentAgg = new Map<string, CategorySpending>()
  const subAgg = new Map<string, SubEntry>()

  for (const tx of data) {
    const cat = tx.category
    const parent = cat?.parent_id ? parentMap.get(cat.parent_id) : null
    const effectiveCat = parent ?? cat

    const key = effectiveCat?.id ?? '__none__'
    const parentEntry = parentAgg.get(key)
    if (parentEntry) {
      parentEntry.amount += tx.amount
    } else {
      parentAgg.set(key, {
        category_id: effectiveCat?.id ?? '',
        name: effectiveCat?.name ?? 'Sem categoria',
        icon: effectiveCat?.icon ?? null,
        color: effectiveCat?.color ?? '#94a3b8',
        amount: tx.amount,
        children: [],
      })
    }

    // Track subcategory contribution only when different from effective
    if (cat && parent && cat.id !== parent.id) {
      const subKey = `${key}__${cat.id}`
      const sub = subAgg.get(subKey)
      if (sub) {
        sub.amount += tx.amount
      } else {
        subAgg.set(subKey, {
          category_id: cat.id,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          amount: tx.amount,
        })
      }
    }
  }

  // Attach children to parents
  for (const [subKey, sub] of Array.from(subAgg)) {
    const parentKey = subKey.split('__')[0]
    const parent = parentAgg.get(parentKey)
    if (parent) parent.children!.push(sub)
  }

  // Sort children
  for (const entry of Array.from(parentAgg.values())) {
    entry.children!.sort((a: SubEntry, b: SubEntry) => b.amount - a.amount)
    if (entry.children!.length === 0) delete entry.children
  }

  return Array.from(parentAgg.values()).sort((a: CategorySpending, b: CategorySpending) => b.amount - a.amount)
}

export async function getExpensesByCategory(month: number, year: number): Promise<CategorySpending[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const entityId = await getActiveEntityId(supabase, user.id)
  const { from, to } = monthRange(month, year)

  let query = supabase
    .from('transactions')
    .select('amount, category:categories(id, name, icon, color, parent_id)')
    .eq('user_id', user.id)
    .eq('type', 'expense')
    .gte('date', from)
    .lt('date', to)

  if (entityId) query = query.eq('entity_id', entityId)

  const { data } = await query
  if (!data) return []

  return groupByParent(supabase, data as unknown as Array<{ amount: number; category: RawCat | null }>)
}

export async function getIncomeByCategory(month: number, year: number): Promise<CategorySpending[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const entityId = await getActiveEntityId(supabase, user.id)
  const { from, to } = monthRange(month, year)

  let query = supabase
    .from('transactions')
    .select('amount, category:categories(id, name, icon, color, parent_id)')
    .eq('user_id', user.id)
    .eq('type', 'income')
    .gte('date', from)
    .lt('date', to)

  if (entityId) query = query.eq('entity_id', entityId)

  const { data } = await query
  if (!data) return []

  return groupByParent(supabase, data as unknown as Array<{ amount: number; category: RawCat | null }>)
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
