'use server'

import { createClient } from '@/lib/supabase/server'
import { DRE_GROUP_VALUES, type DREGroupKey } from '@/lib/constants/dre-groups'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DRECategoryItem {
  categoryId: string
  name: string
  icon: string | null
  color: string | null
  value: number
  prevValue: number
}

export interface DREGroup {
  total: number
  prevTotal: number
  items: DRECategoryItem[]
}

export interface DREResult {
  periodLabel: string
  prevLabel: string
  receita_bruta: DREGroup
  deducoes: DREGroup
  cmv: DREGroup
  despesa_operacional: DREGroup
  depreciacao: DREGroup
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function pad(n: number) { return String(n).padStart(2, '0') }

function monthRange(month: number, year: number) {
  const nm = month === 12 ? 1 : month + 1
  const ny = month === 12 ? year + 1 : year
  return { from: `${year}-${pad(month)}-01`, to: `${ny}-${pad(nm)}-01` }
}

function yearRange(year: number) {
  return { from: `${year}-01-01`, to: `${year + 1}-01-01` }
}

function prevMonthRange(month: number, year: number) {
  const pm = month === 1 ? 12 : month - 1
  const py = month === 1 ? year - 1 : year
  return monthRange(pm, py)
}

type TxRow = {
  type: string
  amount: number
  category: { id: string; name: string; icon: string | null; color: string | null; dre_group: string | null } | null
}

function emptyGroup(): DREGroup {
  return { total: 0, prevTotal: 0, items: [] }
}

function aggregate(rows: TxRow[]): Record<DREGroupKey, { total: number; byCategory: Map<string, DRECategoryItem> }> {
  const acc: Record<DREGroupKey, { total: number; byCategory: Map<string, DRECategoryItem> }> = {
    receita_bruta: { total: 0, byCategory: new Map() },
    deducoes: { total: 0, byCategory: new Map() },
    cmv: { total: 0, byCategory: new Map() },
    despesa_operacional: { total: 0, byCategory: new Map() },
    depreciacao: { total: 0, byCategory: new Map() },
  }

  for (const row of rows) {
    const g = row.category?.dre_group as DREGroupKey | null | undefined
    if (!g || !(g in acc)) continue

    acc[g].total += row.amount

    const catId = row.category!.id
    if (!acc[g].byCategory.has(catId)) {
      acc[g].byCategory.set(catId, {
        categoryId: catId,
        name: row.category!.name,
        icon: row.category!.icon,
        color: row.category!.color,
        value: 0,
        prevValue: 0,
      })
    }
    acc[g].byCategory.get(catId)!.value += row.amount
  }

  return acc
}

function mergeGroups(
  curr: ReturnType<typeof aggregate>,
  prev: ReturnType<typeof aggregate>
): Record<DREGroupKey, DREGroup> {
  const keys = DRE_GROUP_VALUES
  const result = {} as Record<DREGroupKey, DREGroup>

  for (const key of keys) {
    const cMap = curr[key].byCategory
    const pMap = prev[key].byCategory

    // Merge category items
    const allIds = Array.from(new Set([...Array.from(cMap.keys()), ...Array.from(pMap.keys())]))
    const items: DRECategoryItem[] = []
    for (const id of allIds) {
      const c = cMap.get(id)
      const p = pMap.get(id)
      items.push({
        categoryId: id,
        name: (c ?? p)!.name,
        icon: (c ?? p)!.icon,
        color: (c ?? p)!.color,
        value: c?.value ?? 0,
        prevValue: p?.value ?? 0,
      })
    }
    items.sort((a, b) => b.value - a.value)

    result[key] = {
      total: curr[key].total,
      prevTotal: prev[key].total,
      items,
    }
  }

  return result
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function getDRE(
  entityId: string,
  periodType: 'month' | 'year',
  month: number,
  year: number
): Promise<DREResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const empty: DREResult = {
    periodLabel: '',
    prevLabel: '',
    receita_bruta: emptyGroup(),
    deducoes: emptyGroup(),
    cmv: emptyGroup(),
    despesa_operacional: emptyGroup(),
    depreciacao: emptyGroup(),
  }

  if (!user) return empty

  const { from, to } = periodType === 'month' ? monthRange(month, year) : yearRange(year)
  const { from: prevFrom, to: prevTo } = periodType === 'month'
    ? prevMonthRange(month, year)
    : yearRange(year - 1)

  const periodLabel = periodType === 'month'
    ? `${MONTHS_PT[month - 1]}/${year}`
    : String(year)
  const prevLabel = periodType === 'month'
    ? (() => { const pm = month === 1 ? 12 : month - 1; const py = month === 1 ? year - 1 : year; return `${MONTHS_PT[pm - 1]}/${py}` })()
    : String(year - 1)

  const [currResult, prevResult] = await Promise.all([
    supabase
      .from('transactions')
      .select('type, amount, category:categories(id, name, icon, color, dre_group)')
      .eq('entity_id', entityId)
      .eq('user_id', user.id)
      .in('type', ['income', 'expense'])
      .gte('date', from)
      .lt('date', to),

    supabase
      .from('transactions')
      .select('type, amount, category:categories(id, name, icon, color, dre_group)')
      .eq('entity_id', entityId)
      .eq('user_id', user.id)
      .in('type', ['income', 'expense'])
      .gte('date', prevFrom)
      .lt('date', prevTo),
  ])

  const currAgg = aggregate((currResult.data ?? []) as unknown as TxRow[])
  const prevAgg = aggregate((prevResult.data ?? []) as unknown as TxRow[])
  const groups = mergeGroups(currAgg, prevAgg)

  return { periodLabel, prevLabel, ...groups }
}
