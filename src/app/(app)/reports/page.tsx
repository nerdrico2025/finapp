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
import { ExpenseCategoryTable, IncomeCategoryTable } from './CategoryTable'
import { UpgradeGate } from '@/components/ui/UpgradeGate'
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
    <UpgradeGate feature="canAccessReports">
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
        <ExpensesByCategoryChart data={expensesByCategory} />
      </div>

      {/* ── Expense Table ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-900">Despesas por categoria</h2>
          {totalExpenses > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              Total: {formatCurrency(totalExpenses)} — clique em uma linha para ver subcategorias
            </p>
          )}
        </div>
        <ExpenseCategoryTable data={expensesByCategory} total={totalExpenses} budgetMap={budgetMap} />
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
        <IncomeCategoryTable data={incomeByCategory} total={totalIncome} />
      </div>
    </div>
    </UpgradeGate>
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
