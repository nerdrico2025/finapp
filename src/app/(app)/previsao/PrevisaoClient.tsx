'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Wallet, Plus, X,
  RefreshCw, ChevronRight, CalendarRange,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import type { TransacaoPrevista, BudgetPrevisao, ChartPoint } from '@/lib/actions/previsao'
import type { Category } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransacaoHipotetica {
  id: string
  type: 'income' | 'expense'
  description: string
  amount: number
  category_id: string | null
  category_name: string
  category_color: string
  category_icon: string
  source: 'hipotetica'
}

type ItemPrevisto = TransacaoPrevista | TransacaoHipotetica

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MONTHS_LONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  transactions: TransacaoPrevista[]
  budgets: BudgetPrevisao[]
  chartData: ChartPoint[]
  categories: Category[]
  month: number
  year: number
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PrevisaoClient({ transactions, budgets, chartData, categories, month, year }: Props) {
  const router = useRouter()

  const now = new Date()
  const todayMonth = now.getMonth() + 1
  const todayYear  = now.getFullYear()

  // ── State ──────────────────────────────────────────────────────────────────
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(transactions.map((t) => t.id))
  )
  const [hypotheticals, setHypotheticals] = useState<TransacaoHipotetica[]>([])
  const [showHypForm, setShowHypForm] = useState(false)
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [customMonth, setCustomMonth] = useState(month)
  const [customYear, setCustomYear] = useState(year)

  // Hypothetical form fields
  const [hypType, setHypType] = useState<'income' | 'expense'>('expense')
  const [hypDesc, setHypDesc] = useState('')
  const [hypCategoryId, setHypCategoryId] = useState('')
  const [hypAmount, setHypAmount] = useState('')

  // ── Pills ──────────────────────────────────────────────────────────────────
  const pills = useMemo(() => {
    const result = []
    for (let i = 0; i < 6; i++) {
      const d = new Date(todayYear, todayMonth - 1 + i, 1)
      result.push({ month: d.getMonth() + 1, year: d.getFullYear() })
    }
    return result
  }, [todayMonth, todayYear])

  // ── Derived state (all reactive, zero server calls) ────────────────────────
  const allItems = useMemo<ItemPrevisto[]>(
    () => [...transactions, ...hypotheticals],
    [transactions, hypotheticals]
  )

  const activeItems = useMemo(
    () => allItems.filter((item) => checkedIds.has(item.id)),
    [allItems, checkedIds]
  )

  const totalIncome = useMemo(
    () => activeItems.filter((i) => i.type === 'income').reduce((s, i) => s + i.amount, 0),
    [activeItems]
  )

  const totalExpenses = useMemo(
    () => activeItems.filter((i) => i.type === 'expense').reduce((s, i) => s + i.amount, 0),
    [activeItems]
  )

  const saldo = totalIncome - totalExpenses

  // Category breakdown — expense categories only (vs budget)
  const categorySummary = useMemo(() => {
    const byCategory = new Map<string, { name: string; color: string | null; icon: string | null; previsto: number }>()
    for (const item of activeItems) {
      if (item.type !== 'expense') continue
      const key = item.category_id ?? '__none__'
      const existing = byCategory.get(key)
      if (existing) {
        existing.previsto += item.amount
      } else {
        byCategory.set(key, {
          name: item.category_name,
          color: item.category_color,
          icon: item.category_icon,
          previsto: item.amount,
        })
      }
    }
    return byCategory
  }, [activeItems])

  // Merge budgets with category summary
  const categoryRows = useMemo(() => {
    const budgetMap = new Map(budgets.map((b) => [b.category_id, b]))
    const rows: {
      category_id: string
      name: string
      color: string | null
      icon: string | null
      budgeted: number
      previsto: number
      hasBudget: boolean
    }[] = []

    // Categories with budget
    for (const b of budgets) {
      const summary = categorySummary.get(b.category_id) ?? { previsto: 0 }
      rows.push({
        category_id: b.category_id,
        name: b.category_name,
        color: b.category_color,
        icon: b.category_icon,
        budgeted: b.budgeted,
        previsto: (summary as { previsto: number }).previsto,
        hasBudget: true,
      })
    }

    // Categories with transactions but no budget
    for (const [key, summary] of Array.from(categorySummary.entries())) {
      if (!budgetMap.has(key) && key !== '__none__') {
        rows.push({
          category_id: key,
          name: summary.name,
          color: summary.color,
          icon: summary.icon,
          budgeted: 0,
          previsto: summary.previsto,
          hasBudget: false,
        })
      }
    }

    // "Sem categoria" group if present
    const noCat = categorySummary.get('__none__')
    if (noCat && !budgetMap.has('__none__')) {
      rows.push({
        category_id: '__none__',
        name: 'Sem categoria',
        color: '#94a3b8',
        icon: '📋',
        budgeted: 0,
        previsto: noCat.previsto,
        hasBudget: false,
      })
    }

    return rows
  }, [budgets, categorySummary])

  // Reactive chart: update selected month bar with live state
  const reactiveChartData = useMemo(() => {
    return chartData.map((point) => {
      if (point.month === month && point.year === year) {
        return { ...point, income: totalIncome, expenses: totalExpenses }
      }
      return point
    })
  }, [chartData, month, year, totalIncome, totalExpenses])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const toggleItem = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  function navigateTo(m: number, y: number) {
    router.push(`/previsao?month=${m}&year=${y}`)
  }

  function handleAddHypothetical() {
    const amount = parseFloat(hypAmount.replace(',', '.'))
    if (!hypDesc.trim() || !amount || amount <= 0) return

    const cat = categories.find((c) => c.id === hypCategoryId)
    const id = crypto.randomUUID()
    const hyp: TransacaoHipotetica = {
      id,
      type: hypType,
      description: hypDesc.trim(),
      amount,
      category_id: hypCategoryId || null,
      category_name: cat?.name ?? 'Sem categoria',
      category_color: cat?.color ?? '#94a3b8',
      category_icon: cat?.icon ?? '📋',
      source: 'hipotetica',
    }
    setHypotheticals((prev) => [...prev, hyp])
    setCheckedIds((prev) => new Set(Array.from(prev).concat(id)))
    setHypDesc('')
    setHypAmount('')
    setHypCategoryId('')
    setShowHypForm(false)
  }

  function removeHypothetical(id: string) {
    setHypotheticals((prev) => prev.filter((h) => h.id !== id))
    setCheckedIds((prev) => { const n = new Set(prev); n.delete(id); return n })
  }

  const filteredCategories = categories.filter((c) => c.type === (hypType === 'income' ? 'income' : 'expense'))

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Previsão Orçamentária</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {MONTHS_LONG[month - 1]} {year} · {allItems.length} itens projetados
          </p>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-2 items-center">
        {pills.map((pill) => {
          const isSelected = pill.month === month && pill.year === year
          return (
            <button
              key={`${pill.year}-${pill.month}`}
              onClick={() => { setShowCustomPicker(false); navigateTo(pill.month, pill.year) }}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-colors border',
                isSelected
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400 hover:text-emerald-700'
              )}
            >
              {MONTHS_SHORT[pill.month - 1]} {pill.year}
            </button>
          )
        })}

        <button
          onClick={() => setShowCustomPicker(!showCustomPicker)}
          className={cn(
            'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border',
            showCustomPicker
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400 hover:text-emerald-700'
          )}
        >
          <CalendarRange className="w-3.5 h-3.5" />
          Personalizado
        </button>

        {showCustomPicker && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-xl border border-gray-200 shadow-sm">
            <select
              value={customMonth}
              onChange={(e) => setCustomMonth(parseInt(e.target.value))}
              className="text-sm border-none focus:outline-none bg-transparent text-gray-700"
            >
              {MONTHS_LONG.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={customYear}
              onChange={(e) => setCustomYear(parseInt(e.target.value))}
              className="text-sm border-none focus:outline-none bg-transparent text-gray-700"
            >
              {[todayYear, todayYear + 1, todayYear + 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={() => { setShowCustomPicker(false); navigateTo(customMonth, customYear) }}
              className="flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white text-xs font-medium rounded-lg"
            >
              Ir <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="Receitas previstas"
          value={totalIncome}
          icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
          color="emerald"
        />
        <SummaryCard
          label="Despesas previstas"
          value={totalExpenses}
          icon={<TrendingDown className="w-5 h-5 text-red-500" />}
          color="red"
        />
        <SummaryCard
          label="Saldo projetado"
          value={saldo}
          icon={<Wallet className="w-5 h-5 text-blue-500" />}
          color={saldo >= 0 ? 'blue' : 'red'}
        />
      </div>

      {/* Category breakdown + Transaction list */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* BLOCO 3 — Category breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-900">Análise por Categoria</h2>
            <p className="text-xs text-gray-400 mt-0.5">Despesas previstas vs orçamento definido</p>
          </div>

          {categoryRows.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <p className="text-sm">Nenhuma despesa projetada neste período.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {/* Rows with budget */}
              {categoryRows.filter((r) => r.hasBudget).map((row) => (
                <CategoryRow key={row.category_id} row={row} />
              ))}

              {/* Rows without budget */}
              {categoryRows.some((r) => !r.hasBudget) && (
                <>
                  <div className="px-5 py-2 bg-gray-50">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                      Sem orçamento definido
                    </p>
                  </div>
                  {categoryRows.filter((r) => !r.hasBudget).map((row) => (
                    <CategoryRow key={row.category_id} row={row} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* BLOCO 4 — Transaction list */}
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Transações Previstas</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {activeItems.length} de {allItems.length} selecionadas
              </p>
            </div>
            <button
              onClick={() => setShowHypForm(!showHypForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar hipótese
            </button>
          </div>

          {/* Hypothetical form */}
          {showHypForm && (
            <div className="px-5 py-4 border-b border-emerald-100 bg-emerald-50/40 space-y-3">
              <div className="flex gap-1.5 p-1 bg-white rounded-lg border border-gray-200 w-fit">
                {(['expense', 'income'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setHypType(t)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                      hypType === t
                        ? t === 'expense' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'
                        : 'text-gray-500 hover:text-gray-700'
                    )}
                  >
                    {t === 'expense' ? '↓ Despesa' : '↑ Receita'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Descrição"
                  value={hypDesc}
                  onChange={(e) => setHypDesc(e.target.value)}
                  className="col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <select
                  value={hypCategoryId}
                  onChange={(e) => setHypCategoryId(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Sem categoria</option>
                  {filteredCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Valor"
                  value={hypAmount}
                  onChange={(e) => setHypAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleAddHypothetical}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Adicionar
                </button>
                <button
                  onClick={() => setShowHypForm(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Transaction list */}
          <div className="max-h-[520px] overflow-y-auto">
            {allItems.length === 0 ? (
              <div className="py-10 text-center text-gray-400">
                <RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Nenhuma transação projetada.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {allItems.map((item) => {
                  const checked = checkedIds.has(item.id)
                  const isHyp = item.source === 'hipotetica'
                  return (
                    <li
                      key={item.id}
                      className={cn(
                        'flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-50',
                        !checked && 'opacity-50'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleItem(item.id)}
                        className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                      />

                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0"
                        style={{ backgroundColor: `${item.category_color}20` }}
                      >
                        {item.category_icon}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-sm font-medium text-gray-900 truncate',
                          !checked && 'line-through text-gray-400'
                        )}>
                          {item.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className={cn('text-xs text-gray-400', !checked && 'line-through')}>
                            {item.category_name}
                          </p>
                          {'date' in item && (
                            <>
                              <span className="text-gray-300">·</span>
                              <p className={cn('text-xs text-gray-400', !checked && 'line-through')}>
                                {formatDate(item.date)}
                              </p>
                            </>
                          )}
                        </div>
                      </div>

                      <SourceBadge source={item.source} />

                      <p className={cn(
                        'text-sm font-semibold shrink-0 tabular-nums',
                        item.type === 'income' ? 'text-emerald-600' : 'text-red-600',
                        !checked && 'line-through text-gray-400'
                      )}>
                        {formatCurrency(item.amount)}
                      </p>

                      {isHyp && (
                        <button
                          onClick={() => removeHypothetical(item.id)}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* BLOCO 5 — 6-month projection chart */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Projeção 6 Meses</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Receitas e despesas projetadas · o mês selecionado reflete as seleções acima
          </p>
        </div>
        <div className="h-64">
          <ProjectionChart data={reactiveChartData} selectedMonth={month} selectedYear={year} />
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  label, value, icon, color,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: 'emerald' | 'red' | 'blue'
}) {
  const colors = {
    emerald: 'text-emerald-700',
    red: 'text-red-600',
    blue: 'text-blue-700',
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-xs font-medium text-gray-500">{label}</p>
      </div>
      <p className={cn('text-2xl font-bold tabular-nums', colors[color])}>
        {formatCurrency(Math.abs(value))}
      </p>
    </div>
  )
}

function SourceBadge({ source }: { source: string }) {
  if (source === 'recorrente') {
    return (
      <span className="shrink-0 px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-medium rounded-full">
        Recorrente
      </span>
    )
  }
  if (source === 'hipotetica') {
    return (
      <span className="shrink-0 px-1.5 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-medium rounded-full">
        Hipotética
      </span>
    )
  }
  return (
    <span className="shrink-0 px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-medium rounded-full">
      Lançada
    </span>
  )
}

function CategoryRow({
  row,
}: {
  row: {
    name: string
    color: string | null
    icon: string | null
    budgeted: number
    previsto: number
    hasBudget: boolean
  }
}) {
  const margem = row.budgeted - row.previsto

  let statusColor = 'bg-gray-300' // no budget
  if (row.hasBudget) {
    const pct = row.budgeted > 0 ? margem / row.budgeted : -1
    if (margem < 0) statusColor = 'bg-red-500'
    else if (pct <= 0.15) statusColor = 'bg-amber-400'
    else statusColor = 'bg-emerald-500'
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
        style={{ backgroundColor: `${row.color ?? '#94a3b8'}20` }}
      >
        {row.icon ?? '📋'}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{row.name}</p>
      </div>

      <div className="flex items-center gap-4 text-right shrink-0">
        <div className="w-20 hidden sm:block">
          <p className="text-xs text-gray-400">Orçado</p>
          <p className="text-xs font-medium text-gray-700">
            {row.hasBudget ? formatCurrency(row.budgeted) : '—'}
          </p>
        </div>
        <div className="w-20">
          <p className="text-xs text-gray-400">Previsto</p>
          <p className="text-xs font-semibold text-gray-900">{formatCurrency(row.previsto)}</p>
        </div>
        <div className="w-20 hidden md:block">
          <p className="text-xs text-gray-400">Margem</p>
          <p className={cn(
            'text-xs font-semibold',
            !row.hasBudget ? 'text-gray-400' : margem < 0 ? 'text-red-600' : 'text-emerald-600'
          )}>
            {row.hasBudget ? formatCurrency(margem) : '—'}
          </p>
        </div>
        <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', statusColor)} />
      </div>
    </div>
  )
}

// ─── Projection Chart ─────────────────────────────────────────────────────────

interface ChartTooltipPayload {
  name: string
  value: number
  color: string
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: ChartTooltipPayload[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm space-y-1.5">
      <p className="font-semibold text-gray-900 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="font-medium text-gray-900">{formatCurrency(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  )
}

function ProjectionChart({
  data,
  selectedMonth,
  selectedYear,
}: {
  data: ChartPoint[]
  selectedMonth: number
  selectedYear: number
}) {
  if (data.every((d) => d.income === 0 && d.expenses === 0)) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-400">
        Nenhuma projeção disponível para este período
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barGap={4} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="label"
          tick={({ x, y, payload }) => {
            const point = data.find((d) => d.label === payload.value)
            const isSelected = point?.month === selectedMonth && point?.year === selectedYear
            return (
              <text
                x={x}
                y={Number(y) + 10}
                textAnchor="middle"
                fontSize={12}
                fontWeight={isSelected ? 700 : 400}
                fill={isSelected ? '#059669' : '#94a3b8'}
              >
                {payload.value}
              </text>
            )
          }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(value) => {
            const v = value ?? 0
            return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
          }}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f8fafc' }} />
        <Legend
          formatter={(value) => (
            <span style={{ fontSize: 12, color: '#6b7280' }}>{value}</span>
          )}
        />
        <Bar dataKey="income"   name="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expenses" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
