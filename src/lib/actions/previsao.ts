'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransacaoPrevista {
  id: string
  type: 'income' | 'expense'
  description: string
  amount: number
  date: string
  category_id: string | null
  category_name: string
  category_color: string
  category_icon: string
  source: 'lancada' | 'recorrente'
  recurring_rule_id?: string
}

export interface BudgetPrevisao {
  category_id: string
  category_name: string
  category_color: string | null
  category_icon: string | null
  budgeted: number
}

export interface ChartPoint {
  label: string
  month: number
  year: number
  income: number
  expenses: number
}

export interface PrevisaoData {
  transactions: TransacaoPrevista[]
  budgets: BudgetPrevisao[]
  chartData: ChartPoint[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const pad = (n: number) => String(n).padStart(2, '0')

function periodBounds(month: number, year: number) {
  const lastDay = new Date(year, month, 0).getDate()
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
  }
}

function addPeriod(dateStr: string, frequency: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  switch (frequency) {
    case 'daily':     d.setDate(d.getDate() + 1);         break
    case 'weekly':    d.setDate(d.getDate() + 7);         break
    case 'biweekly':  d.setDate(d.getDate() + 14);        break
    case 'monthly':   d.setMonth(d.getMonth() + 1);       break
    case 'quarterly': d.setMonth(d.getMonth() + 3);       break
    case 'yearly':    d.setFullYear(d.getFullYear() + 1); break
  }
  return d.toISOString().split('T')[0]
}

type RuleRow = {
  id: string
  name: string
  type: string
  amount: number
  frequency: string
  end_date: string | null
  next_date: string
  category_id: string | null
  category: { name: string | null; color: string | null; icon: string | null } | null
}

function projectRulesForPeriod(
  rules: RuleRow[],
  periodStart: string,
  periodEnd: string,
  excludeSet: Set<string>,
): TransacaoPrevista[] {
  const results: TransacaoPrevista[] = []

  for (const rule of rules) {
    if (rule.type === 'transfer') continue

    let date = rule.next_date

    // Fast-forward to period window
    let safety = 0
    while (date < periodStart && safety < 5000) {
      date = addPeriod(date, rule.frequency)
      safety++
    }

    // Collect all occurrences within the window
    safety = 0
    while (date <= periodEnd && safety < 60) {
      if (rule.end_date && date > rule.end_date) break

      const key = `${rule.id}_${date}`
      if (!excludeSet.has(key)) {
        results.push({
          id: `rec_${rule.id}_${date}`,
          type: rule.type as 'income' | 'expense',
          description: rule.name,
          amount: rule.amount,
          date,
          category_id: rule.category_id,
          category_name: rule.category?.name ?? 'Sem categoria',
          category_color: rule.category?.color ?? '#94a3b8',
          category_icon: rule.category?.icon ?? '📋',
          source: 'recorrente',
          recurring_rule_id: rule.id,
        })
      }

      date = addPeriod(date, rule.frequency)
      safety++
    }
  }

  return results
}

// ─── Main Action ──────────────────────────────────────────────────────────────

export async function getPrevisaoData(month: number, year: number): Promise<PrevisaoData> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { transactions: [], budgets: [], chartData: [] }

  const entityId = await getActiveEntityId(supabase, user.id)

  const now = new Date()
  const todayMonth = now.getMonth() + 1
  const todayYear = now.getFullYear()
  const isCurrentMonth = month === todayMonth && year === todayYear

  const { start: periodStart, end: periodEnd } = periodBounds(month, year)

  // ── Parallel fetches ───────────────────────────────────────────────────────
  let rulesQ = supabase
    .from('recurring_rules')
    .select('id, name, type, amount, frequency, end_date, next_date, category_id, category:categories(name, color, icon)')
    .eq('user_id', user.id)
    .eq('is_active', true)
  if (entityId) rulesQ = rulesQ.eq('entity_id', entityId)

  let txQ = supabase
    .from('transactions')
    .select('id, type, description, amount, date, category_id, recurring_rule_id, category:categories(name, color, icon)')
    .eq('user_id', user.id)
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .neq('type', 'transfer')
  if (entityId) txQ = txQ.eq('entity_id', entityId)
  if (isCurrentMonth) txQ = txQ.eq('status', 'pending')

  let budgetQ = supabase
    .from('budgets')
    .select('category_id, amount, category:categories(name, color, icon)')
    .eq('user_id', user.id)
  if (entityId) budgetQ = budgetQ.eq('entity_id', entityId)

  // Chart: all real transactions in the 6-month window
  const { start: chartStart } = periodBounds(todayMonth, todayYear)
  const sixthMonth = new Date(todayYear, todayMonth - 1 + 5, 1)
  const { end: chartEnd } = periodBounds(sixthMonth.getMonth() + 1, sixthMonth.getFullYear())

  let chartTxQ = supabase
    .from('transactions')
    .select('type, amount, date, recurring_rule_id')
    .eq('user_id', user.id)
    .gte('date', chartStart)
    .lte('date', chartEnd)
    .neq('type', 'transfer')
  if (entityId) chartTxQ = chartTxQ.eq('entity_id', entityId)

  const [
    { data: rules },
    { data: rawTxs },
    { data: rawBudgets },
    { data: chartTxs },
  ] = await Promise.all([rulesQ, txQ, budgetQ, chartTxQ])

  const typedRules = (rules ?? []) as unknown as RuleRow[]

  // ── Build transactions list ────────────────────────────────────────────────
  const excludeSet = new Set<string>()
  const realTxs: TransacaoPrevista[] = []

  for (const tx of rawTxs ?? []) {
    const cat = tx.category as { name?: string | null; color?: string | null; icon?: string | null } | null
    realTxs.push({
      id: tx.id,
      type: tx.type as 'income' | 'expense',
      description: tx.description ?? '',
      amount: tx.amount,
      date: tx.date,
      category_id: tx.category_id,
      category_name: cat?.name ?? 'Sem categoria',
      category_color: cat?.color ?? '#94a3b8',
      category_icon: cat?.icon ?? '📋',
      source: 'lancada',
      recurring_rule_id: tx.recurring_rule_id ?? undefined,
    })
    if (tx.recurring_rule_id) excludeSet.add(`${tx.recurring_rule_id}_${tx.date}`)
  }

  const projected = projectRulesForPeriod(typedRules, periodStart, periodEnd, excludeSet)
  const transactions = [...realTxs, ...projected].sort((a, b) => a.date.localeCompare(b.date))

  // ── Budgets ────────────────────────────────────────────────────────────────
  const budgets: BudgetPrevisao[] = (rawBudgets ?? []).map((b) => {
    const cat = b.category as { name?: string | null; color?: string | null; icon?: string | null } | null
    return {
      category_id: b.category_id,
      category_name: cat?.name ?? 'Sem categoria',
      category_color: cat?.color ?? null,
      category_icon: cat?.icon ?? null,
      budgeted: b.amount,
    }
  })

  // ── Chart: 6-month projection ──────────────────────────────────────────────
  const sixMonths: { month: number; year: number }[] = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(todayYear, todayMonth - 1 + i, 1)
    sixMonths.push({ month: d.getMonth() + 1, year: d.getFullYear() })
  }

  const chartExclude = new Set<string>()
  const chartByMonth = new Map<string, { income: number; expenses: number }>()
  for (const { month: m, year: y } of sixMonths) {
    chartByMonth.set(`${y}-${pad(m)}`, { income: 0, expenses: 0 })
  }

  for (const tx of chartTxs ?? []) {
    const key = tx.date.substring(0, 7)
    const entry = chartByMonth.get(key)
    if (entry) {
      if (tx.type === 'income') entry.income += tx.amount
      else entry.expenses += tx.amount
      if (tx.recurring_rule_id) chartExclude.add(`${tx.recurring_rule_id}_${tx.date}`)
    }
  }

  for (const { month: m, year: y } of sixMonths) {
    const { start: pStart, end: pEnd } = periodBounds(m, y)
    const key = `${y}-${pad(m)}`
    const entry = chartByMonth.get(key)!
    for (const p of projectRulesForPeriod(typedRules, pStart, pEnd, chartExclude)) {
      if (p.type === 'income') entry.income += p.amount
      else entry.expenses += p.amount
    }
  }

  const chartData: ChartPoint[] = sixMonths.map(({ month: m, year: y }) => ({
    label: `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`,
    month: m,
    year: y,
    income: chartByMonth.get(`${y}-${pad(m)}`)?.income ?? 0,
    expenses: chartByMonth.get(`${y}-${pad(m)}`)?.expenses ?? 0,
  }))

  return { transactions, budgets, chartData }
}
