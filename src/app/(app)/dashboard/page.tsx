import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Dashboard' }

import Link from 'next/link'
import {
  TrendingUp, TrendingDown, Wallet, ArrowLeftRight,
  CalendarClock, Target, ArrowRight, RefreshCw,
} from 'lucide-react'
import { processRecurring } from '@/lib/actions/recurring'
import { getTotalBalance } from '@/lib/actions/accounts'
import { getTransactions } from '@/lib/actions/transactions'
import { getUpcomingAlerts } from '@/lib/actions/billAlerts'
import { getGoals } from '@/lib/actions/goals'
import {
  getMonthlySummary,
  getExpensesByCategory,
  getMonthlyOverview,
} from '@/lib/actions/dashboard'
import { ExpensesByCategoryChart } from '@/components/charts/ExpensesByCategoryChart'
import { MonthlyOverviewChart } from '@/components/charts/MonthlyOverviewChart'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

export default async function DashboardPage({
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

  const [
    { generated },
    { total: totalBalance },
    summary,
    expensesByCategory,
    monthlyOverview,
    { data: recentTx },
    { data: upcomingAlerts },
    { data: goals },
  ] = await Promise.all([
    processRecurring(),
    getTotalBalance(),
    getMonthlySummary(month, year),
    getExpensesByCategory(month, year),
    getMonthlyOverview(),
    getTransactions({ pageSize: 5, month, year }),
    getUpcomingAlerts(7),
    getGoals(),
  ])

  const activeGoals = (goals ?? [])
    .filter((g) => g.status === 'active')
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 3)

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <MonthNavigator month={month} year={year} basePath="/dashboard" />
          {generated > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <RefreshCw className="w-3.5 h-3.5" />
              {generated} recorrência{generated > 1 ? 's' : ''} gerada{generated > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Summary Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Saldo total"
          value={formatCurrency(totalBalance)}
          icon={<Wallet className="w-4 h-4" />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          valueColor={totalBalance >= 0 ? 'text-gray-900' : 'text-red-600'}
        />
        <SummaryCard
          label="Receitas do mês"
          value={formatCurrency(summary.income)}
          icon={<TrendingUp className="w-4 h-4" />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          valueColor="text-emerald-600"
        />
        <SummaryCard
          label="Despesas do mês"
          value={formatCurrency(summary.expenses)}
          icon={<TrendingDown className="w-4 h-4" />}
          iconBg="bg-red-50"
          iconColor="text-red-500"
          valueColor="text-red-600"
        />
        <SummaryCard
          label="Saldo do mês"
          value={formatCurrency(summary.balance)}
          icon={<ArrowLeftRight className="w-4 h-4" />}
          iconBg={summary.balance >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
          iconColor={summary.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}
          valueColor={summary.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}
        />
      </div>

      {/* ── Upcoming Alerts ──────────────────────────────────────────────── */}
      {(upcomingAlerts ?? []).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-semibold text-amber-900">Vencimentos próximos</h2>
            </div>
            <Link href="/alerts" className="text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {(upcomingAlerts ?? []).map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2"
              >
                <span className="text-sm font-medium text-gray-900">{a.name}</span>
                {a.amount != null && (
                  <span className="text-xs text-gray-500">{formatCurrency(a.amount)}</span>
                )}
                <span className={cn(
                  'text-xs font-medium px-1.5 py-0.5 rounded-full',
                  a.days_until === 0 ? 'bg-red-100 text-red-700' :
                  a.days_until <= 2 ? 'bg-amber-100 text-amber-700' :
                  'bg-blue-100 text-blue-700'
                )}>
                  {a.days_until === 0 ? 'Hoje' :
                   a.days_until === 1 ? 'Amanhã' :
                   `${a.days_until}d`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Charts ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-5">
            Despesas por categoria
          </h2>
          <ExpensesByCategoryChart data={expensesByCategory} />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            Receitas vs Despesas — últimos 6 meses
          </h2>
          <div className="h-64">
            <MonthlyOverviewChart data={monthlyOverview} />
          </div>
        </div>
      </div>

      {/* ── Recent Transactions + Goals ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Recent transactions */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-900">Transações recentes</h2>
            <Link
              href="/transactions"
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
            >
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {!recentTx || recentTx.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              Nenhuma transação neste mês.
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {recentTx.map((tx) => (
                <li key={tx.id} className="flex items-center gap-3 px-5 py-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                    style={{
                      backgroundColor: tx.category?.color
                        ? `${tx.category.color}18`
                        : '#f3f4f6',
                    }}
                  >
                    {tx.category?.icon ?? (
                      tx.type === 'income'
                        ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                        : <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {tx.description ?? tx.category?.name ?? '—'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatDate(tx.date)}
                      {tx.account && ` · ${tx.account.name}`}
                    </p>
                  </div>

                  <p className={cn(
                    'text-sm font-semibold tabular-nums shrink-0',
                    tx.type === 'income' ? 'text-emerald-600' : 'text-red-600'
                  )}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Goals */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm font-semibold text-gray-900">Metas em progresso</h2>
            </div>
            <Link
              href="/goals"
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
            >
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {activeGoals.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-400 mb-2">Nenhuma meta ativa.</p>
              <Link href="/goals" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                Criar primeira meta
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {activeGoals.map((goal) => {
                const accentColor = goal.color ?? '#10b981'
                return (
                  <li key={goal.id} className="px-5 py-4">
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                        style={{ backgroundColor: `${accentColor}18` }}
                      >
                        {goal.icon ?? <Target className="w-3.5 h-3.5" style={{ color: accentColor }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{goal.name}</p>
                        <p className="text-xs text-gray-400">
                          {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-gray-600 shrink-0">
                        {Math.round(goal.percentage)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(goal.percentage, 100)}%`,
                          backgroundColor: accentColor,
                        }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
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
