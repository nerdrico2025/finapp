'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EntitySummary {
  entityId: string
  entityName: string
  entityType: 'personal' | 'business'
  logoUrl: string | null
  income: number
  expenses: number
  balance: number
}

export interface ConsolidadoChartPoint {
  label: string
  pfIncome: number
  pfExpenses: number
  pjIncome: number
  pjExpenses: number
}

export interface ConsolidadoData {
  month: number
  year: number
  personal: EntitySummary | null
  businesses: EntitySummary[]
  totals: { income: number; expenses: number; balance: number }
  prolabore: number
  chartData: ConsolidadoChartPoint[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function pad(n: number) { return String(n).padStart(2, '0') }

function monthRange(month: number, year: number) {
  const nm = month === 12 ? 1 : month + 1
  const ny = month === 12 ? year + 1 : year
  return { from: `${year}-${pad(month)}-01`, to: `${ny}-${pad(nm)}-01` }
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function getConsolidado(
  month: number,
  year: number
): Promise<ConsolidadoData | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: entities } = await supabase
    .from('entities')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })

  if (!entities || entities.length === 0) return null
  if (!entities.some(e => e.type === 'business')) return null

  const entityIds = entities.map(e => e.id)
  const personalEntity = entities.find(e => e.type === 'personal')
  const businessEntities = entities.filter(e => e.type === 'business')
  const businessIds = new Set(businessEntities.map(e => e.id))

  const { from, to } = monthRange(month, year)

  // Chart: last 6 months
  const now = new Date()
  type InternalPoint = ConsolidadoChartPoint & { _month: number; _year: number }
  const chartPoints: InternalPoint[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return {
      label: MONTH_LABELS[d.getMonth()],
      pfIncome: 0, pfExpenses: 0, pjIncome: 0, pjExpenses: 0,
      _month: d.getMonth() + 1,
      _year: d.getFullYear(),
    }
  })
  const oldest = chartPoints[0]
  const last = chartPoints[chartPoints.length - 1]
  const chartFrom = `${oldest._year}-${pad(oldest._month)}-01`
  const { to: chartTo } = monthRange(last._month, last._year)

  // Two parallel queries: current month (with category) + chart range (without)
  const [monthResult, chartResult] = await Promise.all([
    supabase
      .from('transactions')
      .select('type, amount, entity_id, category:categories(name)')
      .eq('user_id', user.id)
      .in('entity_id', entityIds)
      .in('type', ['income', 'expense'])
      .gte('date', from)
      .lt('date', to),

    supabase
      .from('transactions')
      .select('type, amount, date, entity_id')
      .eq('user_id', user.id)
      .in('entity_id', entityIds)
      .in('type', ['income', 'expense'])
      .gte('date', chartFrom)
      .lt('date', chartTo),
  ])

  // ── Aggregate month summaries ─────────────────────────────────────────────

  type MonthRow = {
    type: string
    amount: number
    entity_id: string
    category: { name: string } | null
  }

  const summaryMap = new Map<string, { income: number; expenses: number }>()
  for (const e of entities) summaryMap.set(e.id, { income: 0, expenses: 0 })

  let prolabore = 0

  for (const row of (monthResult.data ?? []) as unknown as MonthRow[]) {
    const s = summaryMap.get(row.entity_id)
    if (!s) continue

    if (row.type === 'income') {
      s.income += row.amount
      // Detect pró-labore: income in personal entity with matching category name
      if (row.entity_id === personalEntity?.id && row.category?.name) {
        const n = row.category.name.toLowerCase().replace(/\s/g, '')
        if (n.includes('prolabore') || n.includes('pró-labore') || n.includes('pro-labore')) {
          prolabore += row.amount
        }
      }
    } else {
      s.expenses += row.amount
    }
  }

  // ── Build entity summaries ────────────────────────────────────────────────

  const toSummary = (e: (typeof entities)[0]): EntitySummary => {
    const s = summaryMap.get(e.id) ?? { income: 0, expenses: 0 }
    return {
      entityId: e.id,
      entityName: e.name,
      entityType: e.type as 'personal' | 'business',
      logoUrl: (e as { logo_url?: string | null }).logo_url ?? null,
      income: s.income,
      expenses: s.expenses,
      balance: s.income - s.expenses,
    }
  }

  const personalSummary = personalEntity ? toSummary(personalEntity) : null
  const businessSummaries = businessEntities.map(toSummary)

  const totals = [...(personalSummary ? [personalSummary] : []), ...businessSummaries].reduce(
    (acc, e) => ({
      income: acc.income + e.income,
      expenses: acc.expenses + e.expenses,
      balance: acc.balance + e.balance,
    }),
    { income: 0, expenses: 0, balance: 0 }
  )

  // ── Aggregate chart data ──────────────────────────────────────────────────

  type ChartRow = { type: string; amount: number; date: string; entity_id: string }

  for (const row of (chartResult.data ?? []) as ChartRow[]) {
    const rm = parseInt(row.date.slice(5, 7))
    const ry = parseInt(row.date.slice(0, 4))
    const pt = chartPoints.find(p => p._month === rm && p._year === ry)
    if (!pt) continue
    const isPJ = businessIds.has(row.entity_id)
    if (row.type === 'income') {
      if (isPJ) pt.pjIncome += row.amount; else pt.pfIncome += row.amount
    } else {
      if (isPJ) pt.pjExpenses += row.amount; else pt.pfExpenses += row.amount
    }
  }

  return {
    month,
    year,
    personal: personalSummary,
    businesses: businessSummaries,
    totals,
    prolabore,
    chartData: chartPoints.map(({ label, pfIncome, pfExpenses, pjIncome, pjExpenses }) => ({
      label, pfIncome, pfExpenses, pjIncome, pjExpenses,
    })),
  }
}
