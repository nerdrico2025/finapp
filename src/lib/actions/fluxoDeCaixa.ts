'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FluxoTransaction {
  id: string
  type: 'income' | 'expense' | 'transfer'
  amount: number
  description: string | null
  date: string
  account: { id: string; name: string; color: string | null } | null
  category: { id: string; name: string; icon: string | null; color: string | null } | null
}

export interface WeekGroup {
  week: number
  label: string
  dateRange: string
  transactions: FluxoTransaction[]
  incomeTotal: number
  expenseTotal: number
}

export interface FluxoDeCaixaData {
  entriesTotal: number
  expensesTotal: number
  monthBalance: number
  accumulatedBalance: number
  monthlyData: Array<{
    label: string
    month: number
    year: number
    income: number
    expenses: number
  }>
  weeklyGroups: WeekGroup[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function pad(n: number) { return String(n).padStart(2, '0') }

function monthRange(month: number, year: number) {
  const from = `${year}-${pad(month)}-01`
  const nm = month === 12 ? 1 : month + 1
  const ny = month === 12 ? year + 1 : year
  return { from, to: `${ny}-${pad(nm)}-01` }
}

function weekOfMonth(day: number): number {
  return Math.min(Math.ceil(day / 7), 5)
}

function weekDateRange(week: number, month: number, year: number): string {
  const start = (week - 1) * 7 + 1
  const lastDay = new Date(year, month, 0).getDate()
  const end = Math.min(week * 7, lastDay)
  return `${pad(start)}/${pad(month)} – ${pad(end)}/${pad(month)}`
}

function weekLabel(week: number): string {
  const ordinals = ['1ª', '2ª', '3ª', '4ª', '5ª']
  return `${ordinals[week - 1] ?? `${week}ª`} Semana`
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function getFluxoDeCaixa(
  entityId: string,
  month: number,
  year: number
): Promise<FluxoDeCaixaData> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { entriesTotal: 0, expensesTotal: 0, monthBalance: 0, accumulatedBalance: 0, monthlyData: [], weeklyGroups: [] }
  }

  const { from, to } = monthRange(month, year)

  // ── Parallel queries ──────────────────────────────────────────────────────
  const [monthTxResult, allTxResult, last6Result] = await Promise.all([
    // Current month transactions with relations
    supabase
      .from('transactions')
      .select(`
        id, type, amount, description, date,
        account:accounts(id, name, color),
        category:categories(id, name, icon, color)
      `)
      .eq('user_id', user.id)
      .eq('entity_id', entityId)
      .in('type', ['income', 'expense'])
      .gte('date', from)
      .lt('date', to)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true }),

    // All-time transactions for accumulated balance
    supabase
      .from('transactions')
      .select('type, amount')
      .eq('user_id', user.id)
      .eq('entity_id', entityId)
      .in('type', ['income', 'expense']),

    // Last 6 months for chart
    (() => {
      const now = new Date()
      const points = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
        return { label: MONTH_LABELS[d.getMonth()], month: d.getMonth() + 1, year: d.getFullYear(), income: 0, expenses: 0 }
      })
      const oldest = points[0]
      const last = points[points.length - 1]
      const chartFrom = `${oldest.year}-${pad(oldest.month)}-01`
      const { to: chartTo } = monthRange(last.month, last.year)

      return supabase
        .from('transactions')
        .select('type, amount, date')
        .eq('user_id', user.id)
        .eq('entity_id', entityId)
        .in('type', ['income', 'expense'])
        .gte('date', chartFrom)
        .lt('date', chartTo)
        .then((res: { data: Array<{ type: string; amount: number; date: string }> | null }) => ({ data: res.data, points }))
    })(),
  ])

  // ── Month totals ──────────────────────────────────────────────────────────
  const monthTx = (monthTxResult.data ?? []) as unknown as FluxoTransaction[]
  let entriesTotal = 0
  let expensesTotal = 0
  for (const tx of monthTx) {
    if (tx.type === 'income') entriesTotal += tx.amount
    else expensesTotal += tx.amount
  }

  // ── Accumulated balance ───────────────────────────────────────────────────
  let accumulatedBalance = 0
  for (const tx of allTxResult.data ?? []) {
    accumulatedBalance += tx.type === 'income' ? tx.amount : -tx.amount
  }

  // ── Monthly chart data ────────────────────────────────────────────────────
  const { data: chartTx, points } = last6Result
  for (const tx of chartTx ?? []) {
    const txMonth = parseInt(tx.date.slice(5, 7))
    const txYear = parseInt(tx.date.slice(0, 4))
    const pt = points.find((p: { month: number; year: number }) => p.month === txMonth && p.year === txYear)
    if (!pt) continue
    if (tx.type === 'income') pt.income += tx.amount
    else pt.expenses += tx.amount
  }

  // ── Weekly grouping ───────────────────────────────────────────────────────
  const weekMap = new Map<number, FluxoTransaction[]>()
  for (const tx of monthTx) {
    const day = parseInt(tx.date.slice(8, 10))
    const w = weekOfMonth(day)
    if (!weekMap.has(w)) weekMap.set(w, [])
    weekMap.get(w)!.push(tx)
  }

  const weeklyGroups: WeekGroup[] = Array.from(weekMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([week, txs]) => {
      let incomeTotal = 0
      let expenseTotal = 0
      for (const tx of txs) {
        if (tx.type === 'income') incomeTotal += tx.amount
        else expenseTotal += tx.amount
      }
      return {
        week,
        label: weekLabel(week),
        dateRange: weekDateRange(week, month, year),
        transactions: txs,
        incomeTotal,
        expenseTotal,
      }
    })

  return {
    entriesTotal,
    expensesTotal,
    monthBalance: entriesTotal - expensesTotal,
    accumulatedBalance,
    monthlyData: points,
    weeklyGroups,
  }
}
