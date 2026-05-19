import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Relatórios' }

import { TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react'
import {
  getMonthlySummary,
  getExpensesByCategory,
  getIncomeByCategory,
  getMonthlyOverview,
} from '@/lib/actions/dashboard'
import { getBudgetsWithSpending } from '@/lib/actions/budgets'
import { ExpensesByCategoryChart } from '@/components/charts/ExpensesByCategoryChart'
import { MonthlyOverviewChart } from '@/components/charts/MonthlyOverviewChart'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { month?: string; year?: string }
}) {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  let month = searchParams.month ? parseInt(searchParams.month) : currentMonth
  let year  = searchParams.year  ? parseInt(searchParams.year)  : currentYear

  if (isNaN(month) || month < 1 || month > 12) month = currentMonth
  if (isNaN(year)  || year < 2000)             year  = currentYear
  if (year > currentYear || (year === currentYear && month > currentMonth)) {
    month = currentMonth
    year  = currentYear
  }

  const [summary, expensesByCategory, incomeByCategory, monthlyOverview, { data: budgets }] =
    await Promise.all([
      getMonthlySummary(month, year),
      getExpensesByCategory(month, year),
      getIncomeByCategory(month, year),
      getMonthlyOverview(),
      getBudgetsWithSpending(month, year),
    ])

  const totalExpenses = expensesByCategory.reduce((s, c) => s + c.amount, 0)
  const totalIncome   = incomeByCategory.reduce((s, c) => s + c.amount, 0)

  const budgetMap = new Map((budgets ?? []).map((b) => [b.category_id, b]))

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold text-gray-900">Relatórios</h1>
        <MonthNavigator month={month} year={year} basePath="/reports" />
      </div>

      {/* ── Summary Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="Total de receitas"
          value={formatCurrency(summary.income)}
          icon={<TrendingUp className="w-4 h-4" />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          valueColor="text-emerald-600"
        />
        <SummaryCard
          label="Total de despesas"
          value={formatCurrency(summary.expenses)}
          icon={<TrendingDown className="w-4 h-4" />}
          iconBg="bg-red-50"
          iconColor="text-red-500"
          valueColor="text-red-600"
        />
        <SummaryCard
          label="Saldo do período"
          value={formatCurrency(summary.balance)}
          icon={<ArrowLeftRight className="w-4 h-4" />}
          iconBg={summary.balance >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
          iconColor={summary.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}
          valueColor={summary.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}
        />
      </div>

      {/* ── Bar chart ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          Receitas vs Despesas — últimos 6 meses
        </h2>
        <div className="h-64">
          <MonthlyOverviewChart data={monthlyOverview} />
        </div>
      </div>

      {/* ── Pie chart (detailed 2-column layout) ─────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-5">
          Despesas por categoria
        </h2>
        <ExpensesByCategoryChart data={expensesByCategory} variant="detailed" />
      </div>

      {/* ── Expense Table ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-900">Despesas por categoria</h2>
          {totalExpenses > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              Total: {formatCurrency(totalExpenses)}
            </p>
          )}
        </div>

        {expensesByCategory.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            Nenhuma despesa neste período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">Categoria</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Valor</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">% total</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-400 min-w-[200px]">vs Orçamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {expensesByCategory.map((cat) => {
                  const pct = totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0
                  const budget = budgetMap.get(cat.category_id)
                  const budgetPct = budget ? (cat.amount / budget.amount) * 100 : null
                  const barColor =
                    budgetPct === null ? '#10b981'
                    : budgetPct > 90   ? '#ef4444'
                    : budgetPct > 70   ? '#f59e0b'
                    :                    '#10b981'

                  return (
                    <tr key={cat.category_id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                            style={{ backgroundColor: cat.color ? `${cat.color}20` : '#f1f5f9' }}
                          >
                            {cat.icon ?? '·'}
                          </div>
                          <span className="font-medium text-gray-900">{cat.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-red-600">
                        {formatCurrency(cat.amount)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-gray-500">
                        {pct.toFixed(1)}%
                      </td>
                      <td className="px-5 py-3.5">
                        {budget ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(budgetPct ?? 0, 100)}%`,
                                    backgroundColor: barColor,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                                {(budgetPct ?? 0).toFixed(0)}%
                              </span>
                            </div>
                            <p className="text-xs text-gray-400">
                              de {formatCurrency(budget.amount)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">Sem orçamento</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Income Table ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-900">Receitas por categoria</h2>
          {totalIncome > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              Total: {formatCurrency(totalIncome)}
            </p>
          )}
        </div>

        {incomeByCategory.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            Nenhuma receita neste período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">Categoria</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Valor</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-gray-400">% total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {incomeByCategory.map((cat) => {
                  const pct = totalIncome > 0 ? (cat.amount / totalIncome) * 100 : 0
                  return (
                    <tr key={cat.category_id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                            style={{ backgroundColor: cat.color ? `${cat.color}20` : '#f1f5f9' }}
                          >
                            {cat.icon ?? '·'}
                          </div>
                          <span className="font-medium text-gray-900">{cat.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-emerald-600">
                        {formatCurrency(cat.amount)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-gray-500 tabular-nums w-10 text-right">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, icon, iconBg, iconColor, valueColor,
}: {
  label: string
  value: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  valueColor: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', iconBg, iconColor)}>
          {icon}
        </div>
      </div>
      <p className={cn('text-xl font-bold tabular-nums leading-tight', valueColor)}>{value}</p>
    </div>
  )
}
