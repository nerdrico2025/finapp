import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Dashboard' }

import Link from 'next/link'
import {
  TrendingUp, TrendingDown, Wallet, ArrowLeftRight,
  CalendarClock, Target, ArrowRight, RefreshCw,
  Building2, BarChart3, FileBarChart, Layers,
  Settings, CheckCircle2, Circle,
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
import type { GoalWithProgress } from '@/lib/actions/goals'
import { ExpensesByCategoryChart } from '@/components/charts/ExpensesByCategoryChart'
import { MonthlyOverviewChart } from '@/components/charts/MonthlyOverviewChart'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveEntity = {
  id: string
  name: string
  type: string
  cnpj: string | null
  tax_regime: string | null
  logo_url: string | null
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { month?: string; year?: string; notice?: string }
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

  // ── Detect active entity ───────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let activeEntity: ActiveEntity | null = null
  if (user) {
    const entityId = await getActiveEntityId(supabase, user.id)
    if (entityId) {
      const { data } = await supabase
        .from('entities')
        .select('id, name, type, cnpj, tax_regime, logo_url')
        .eq('id', entityId)
        .single()
      activeEntity = data as ActiveEntity | null
    }
  }

  const isBusinessEntity = activeEntity?.type === 'business'

  // ── Data ──────────────────────────────────────────────────────────────────
  // processRecurring must complete before reading balances to avoid a race
  // condition where getTotalBalance reads mid-update account balances
  const { generated } = await processRecurring()

  const [
    { total: totalBalance },
    summary,
    expensesByCategory,
    monthlyOverview,
    { data: recentTx },
    { data: upcomingAlerts },
    { data: goals },
  ] = await Promise.all([
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

  // ── PJ onboarding check ───────────────────────────────────────────────────
  let onboardingData: { txCount: number; acctCount: number } | null = null
  if (isBusinessEntity && activeEntity && user) {
    const [{ count: txCount }, { count: acctCount }] = await Promise.all([
      supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('entity_id', activeEntity.id)
        .eq('user_id', user.id),
      supabase
        .from('accounts')
        .select('*', { count: 'exact', head: true })
        .eq('entity_id', activeEntity.id),
    ])
    if ((txCount ?? 0) === 0) {
      onboardingData = { txCount: txCount ?? 0, acctCount: acctCount ?? 0 }
    }
  }

  const showOnboarding = !!onboardingData

  return (
    <div className="space-y-6">
      {/* ── PJ-required notice ───────────────────────────────────────────── */}
      {searchParams.notice === 'pj_required' && (
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4">
          <Building2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-900">Seção exclusiva para empresas (PJ)</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Selecione uma entidade empresarial no seletor de contexto da barra lateral para acessar esta seção.
            </p>
          </div>
        </div>
      )}

      {/* ── PJ onboarding card ───────────────────────────────────────────── */}
      {showOnboarding && activeEntity && (
        <OnboardingCard
          entity={activeEntity}
          hasAccounts={(onboardingData?.acctCount ?? 0) > 0}
        />
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
            {isBusinessEntity && activeEntity && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1">
                <Building2 className="w-3 h-3" />
                {activeEntity.name}
              </span>
            )}
          </div>
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

      {/* ── Recent Transactions + Context-specific bottom widget ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Recent transactions — same for both PF and PJ */}
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

        {/* PF: Goals / PJ: Quick links to PJ screens */}
        {isBusinessEntity ? (
          <PJQuickLinks />
        ) : (
          <GoalsWidget activeGoals={activeGoals} />
        )}
      </div>
    </div>
  )
}

// ─── Onboarding Card ──────────────────────────────────────────────────────────

function OnboardingCard({
  entity,
  hasAccounts,
}: {
  entity: ActiveEntity
  hasAccounts: boolean
}) {
  const isConfigured = !!(entity.cnpj || entity.tax_regime || entity.logo_url)

  const steps = [
    {
      label: 'Configure sua empresa',
      description: 'Adicione CNPJ, regime tributário e logo',
      href: '/settings/empresa',
      done: isConfigured,
    },
    {
      label: 'Cadastre suas contas PJ',
      description: 'Conta corrente, caixa, aplicações financeiras',
      href: '/accounts',
      done: hasAccounts,
    },
    {
      label: 'Lance suas primeiras transações',
      description: 'Registre receitas e despesas da empresa',
      href: '/transactions',
      done: false,
    },
  ]

  const completedCount = steps.filter(s => s.done).length

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
          <Building2 className="w-4.5 h-4.5 text-blue-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-blue-900">
            Bem-vindo à <span className="font-bold">{entity.name}</span>!
          </p>
          <p className="text-xs text-blue-600">{completedCount} de {steps.length} passos concluídos</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-blue-200 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>

      <ol className="space-y-2.5">
        {steps.map((step, i) => (
          <li key={i}>
            <Link
              href={step.href}
              className={cn(
                'flex items-start gap-3 p-3 rounded-xl transition-colors group',
                step.done
                  ? 'bg-white/50 cursor-default pointer-events-none'
                  : 'bg-white hover:bg-white/90 border border-blue-100 hover:border-blue-300'
              )}
            >
              {step.done ? (
                <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-4 h-4 text-blue-300 shrink-0 mt-0.5 group-hover:text-blue-500 transition-colors" />
              )}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-xs font-semibold',
                  step.done ? 'text-blue-400 line-through' : 'text-blue-900'
                )}>
                  {i + 1}. {step.label}
                </p>
                {!step.done && (
                  <p className="text-[11px] text-blue-600 mt-0.5">{step.description}</p>
                )}
              </div>
              {!step.done && (
                <ArrowRight className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5 group-hover:text-blue-600 transition-colors" />
              )}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ─── PJ Quick Links ───────────────────────────────────────────────────────────

function PJQuickLinks() {
  const links = [
    {
      href: '/fluxo-de-caixa',
      icon: BarChart3,
      label: 'Fluxo de Caixa',
      description: 'Movimentações da empresa por semana',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      href: '/dre',
      icon: FileBarChart,
      label: 'DRE',
      description: 'Demonstrativo de resultado',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      href: '/consolidado',
      icon: Layers,
      label: 'Consolidado',
      description: 'Visão unificada PF + PJ',
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      href: '/settings/empresa',
      icon: Settings,
      label: 'Configurações PJ',
      description: 'CNPJ, regime, logo da empresa',
      color: 'text-gray-600',
      bg: 'bg-gray-50',
    },
  ]

  return (
    <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100">
      <div className="px-5 py-4 border-b border-gray-50">
        <h2 className="text-sm font-semibold text-gray-900">Módulo Empresarial</h2>
      </div>
      <ul className="divide-y divide-gray-50">
        {links.map(({ href, icon: Icon, label, description, color, bg }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group"
            >
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', bg)}>
                <Icon className={cn('w-4 h-4', color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-400">{description}</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Goals Widget ─────────────────────────────────────────────────────────────

function GoalsWidget({ activeGoals }: { activeGoals: GoalWithProgress[] }) {
  const goals = activeGoals

  return (
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

      {goals.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-gray-400 mb-2">Nenhuma meta ativa.</p>
          <Link href="/goals" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
            Criar primeira meta
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {goals.map((goal) => {
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
