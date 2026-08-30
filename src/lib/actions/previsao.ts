'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import { addPeriod, nextOccurrenceFrom } from '@/lib/utils/recurrence'
import type { RecurrenceFrequency } from '@/types'

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
  source: 'realizada' | 'lancada' | 'alerta'
  bill_alert_id?: string
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
  realizadas: TransacaoPrevista[]
  previstas: TransacaoPrevista[]
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

type AlertRow = {
  id: string
  name: string
  type: string
  amount: number | null
  next_date: string | null
  frequency: string
  end_date: string | null
}

/**
 * Cada bill_alert vira, no máximo, UMA linha de previsão — next_date é usado
 * diretamente como a data prevista, sem recalcular a partir de day_of_month
 * ou frequency (decisão deliberada: alertas mensais que só têm day_of_month
 * preenchido, sem next_date, ficam de fora até serem editados na tela de
 * Alertas). Alertas com next_date nulo não têm ocorrência futura conhecida
 * e são excluídos por completo — não geram linha nenhuma.
 */
function alertsToPrevistas(
  alerts: AlertRow[],
  periodStart: string,
  periodEnd: string,
): TransacaoPrevista[] {
  return alerts
    .filter((a) => a.next_date != null && a.next_date >= periodStart && a.next_date <= periodEnd)
    .map((a) => ({
      id: `alert_${a.id}`,
      type: a.type as 'income' | 'expense',
      description: a.name,
      amount: a.amount ?? 0,
      date: a.next_date as string,
      category_id: null,
      category_name: 'Sem categoria',
      category_color: '#94a3b8',
      category_icon: '📋',
      source: 'alerta' as const,
      bill_alert_id: a.id,
    }))
}

// ─── Main Action ──────────────────────────────────────────────────────────────

export async function getPrevisaoData(month: number, year: number): Promise<PrevisaoData> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { realizadas: [], previstas: [], budgets: [], chartData: [] }

  const entityId = await getActiveEntityId(supabase, user.id)

  const now = new Date()
  const todayMonth = now.getMonth() + 1
  const todayYear = now.getFullYear()
  const isCurrentMonth = month === todayMonth && year === todayYear

  const { start: periodStart, end: periodEnd } = periodBounds(month, year)

  // ── Parallel fetches ───────────────────────────────────────────────────────
  let alertsQ = supabase
    .from('bill_alerts')
    .select('id, name, type, amount, next_date, frequency, end_date')
    .eq('user_id', user.id)
    .eq('is_active', true)
  if (entityId) alertsQ = alertsQ.eq('entity_id', entityId)

  let txQ = supabase
    .from('transactions')
    .select('id, type, description, amount, date, category_id, category:categories(name, color, icon)')
    .eq('user_id', user.id)
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .neq('type', 'transfer')
  if (entityId) txQ = txQ.eq('entity_id', entityId)

  let budgetQ = supabase
    .from('budgets')
    .select('category_id, amount, category:categories(name, color, icon)')
    .eq('user_id', user.id)
  if (entityId) budgetQ = budgetQ.eq('entity_id', entityId)

  // Chart: todos os alertas ativos (filtramos por mês em memória, já que cada
  // um só tem UM next_date) + transações reais na janela de 6 meses.
  const { start: chartStart } = periodBounds(todayMonth, todayYear)
  const sixthMonth = new Date(todayYear, todayMonth - 1 + 5, 1)
  const { end: chartEnd } = periodBounds(sixthMonth.getMonth() + 1, sixthMonth.getFullYear())

  let chartTxQ = supabase
    .from('transactions')
    .select('type, amount, date')
    .eq('user_id', user.id)
    .gte('date', chartStart)
    .lte('date', chartEnd)
    .neq('type', 'transfer')
  if (entityId) chartTxQ = chartTxQ.eq('entity_id', entityId)

  const [
    { data: rawAlerts },
    { data: rawTxs },
    { data: rawBudgets },
    { data: chartTxs },
  ] = await Promise.all([alertsQ, txQ, budgetQ, chartTxQ])

  const typedAlerts = (rawAlerts ?? []) as unknown as AlertRow[]

  // ── Build transactions list ────────────────────────────────────────────────
  const todayStr = `${todayYear}-${pad(todayMonth)}-${pad(now.getDate())}`

  const realizadasFromTx: TransacaoPrevista[] = []
  const previstasFromTx: TransacaoPrevista[] = []

  for (const tx of rawTxs ?? []) {
    const cat = tx.category as { name?: string | null; color?: string | null; icon?: string | null } | null
    const isRealized = isCurrentMonth && tx.date <= todayStr
    const item: TransacaoPrevista = {
      id: tx.id,
      type: tx.type as 'income' | 'expense',
      description: tx.description ?? '',
      amount: tx.amount,
      date: tx.date,
      category_id: tx.category_id,
      category_name: cat?.name ?? 'Sem categoria',
      category_color: cat?.color ?? '#94a3b8',
      category_icon: cat?.icon ?? '📋',
      source: isRealized ? 'realizada' : 'lancada',
    }
    if (isRealized) realizadasFromTx.push(item)
    else previstasFromTx.push(item)
  }

  // No mês corrente, só entram alertas cujo next_date ainda não chegou —
  // mesmo corte que já existia para a projeção de recorrências (o dia de
  // hoje pra frente é "previsão"; antes disso, se ainda não foi lançado
  // manualmente, não faz mais sentido mostrar como próximo).
  const alertsForPeriod = isCurrentMonth
    ? typedAlerts.filter((a) => a.next_date == null || a.next_date > todayStr)
    : typedAlerts
  const projectedFromAlerts = alertsToPrevistas(alertsForPeriod, periodStart, periodEnd)

  const realizadas = realizadasFromTx.sort((a, b) => a.date.localeCompare(b.date))
  const previstas = [...previstasFromTx, ...projectedFromAlerts].sort((a, b) => a.date.localeCompare(b.date))

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

  // ── Chart: 6 meses — cada alerta é projetado por frequency dentro da janela ──
  //
  // Diferente da lista de "previstas" (que usa next_date como está, sem gerar
  // múltiplas ocorrências — ver alertsToPrevistas), o gráfico agregado PRECISA
  // saber quantas vezes um alerta recorrente cai em cada um dos 6 meses, senão
  // uma despesa mensal (ex: aluguel) apareceria projetada só no mês do seu
  // next_date e sumiria dos 5 meses seguintes. Isso não sobrescreve nada no
  // banco — é só uma projeção em memória para somar o gráfico.
  const sixMonths: { month: number; year: number }[] = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(todayYear, todayMonth - 1 + i, 1)
    sixMonths.push({ month: d.getMonth() + 1, year: d.getFullYear() })
  }

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
    }
  }

  // Alertas sem next_date continuam totalmente fora — nenhuma ocorrência é
  // gerada pra eles, nem aqui nem na lista de previstas.
  const MAX_OCCURRENCES_PER_ALERT = 200 // generoso o bastante pra 'daily' cobrir os ~180 dias da janela
  for (const alert of typedAlerts) {
    if (!alert.next_date) continue
    const frequency = alert.frequency as RecurrenceFrequency

    // Se next_date já está desatualizado (antes do início da janela — ex:
    // regra migrada com auto_create=false que nunca avançou), pula direto
    // pra primeira ocorrência dentro da janela em vez de iterar uma por uma
    // desde uma data possivelmente muito antiga.
    let occurrence = alert.next_date < chartStart
      ? nextOccurrenceFrom(alert.next_date, frequency, chartStart)
      : alert.next_date

    let iterations = 0
    while (occurrence <= chartEnd && iterations < MAX_OCCURRENCES_PER_ALERT) {
      if (alert.end_date && occurrence > alert.end_date) break

      const key = occurrence.substring(0, 7)
      const entry = chartByMonth.get(key)
      if (entry) {
        if (alert.type === 'income') entry.income += alert.amount ?? 0
        else entry.expenses += alert.amount ?? 0
      }

      occurrence = addPeriod(occurrence, frequency)
      iterations++
    }
  }

  const chartData: ChartPoint[] = sixMonths.map(({ month: m, year: y }) => ({
    label: `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`,
    month: m,
    year: y,
    income: chartByMonth.get(`${y}-${pad(m)}`)?.income ?? 0,
    expenses: chartByMonth.get(`${y}-${pad(m)}`)?.expenses ?? 0,
  }))

  return { realizadas, previstas, budgets, chartData }
}
