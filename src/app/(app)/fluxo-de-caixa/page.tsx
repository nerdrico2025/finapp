import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Fluxo de Caixa' }

import { redirect } from 'next/navigation'
import { TrendingUp, TrendingDown, ArrowLeftRight, BarChart3, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import { getFluxoDeCaixa } from '@/lib/actions/fluxoDeCaixa'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { FluxoDeCaixaClient } from './FluxoDeCaixaClient'
import { UpgradeGate } from '@/components/ui/UpgradeGate'
import { formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

export default async function FluxoDeCaixaPage({
  searchParams,
}: {
  searchParams: { month?: string; year?: string }
}) {
  // ── Auth & entity gate ────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const entityId = await getActiveEntityId(supabase, user.id)
  if (!entityId) redirect('/dashboard')

  const { data: entity } = await supabase
    .from('entities')
    .select('*')
    .eq('id', entityId)
    .single()

  if (!entity || entity.type !== 'business') redirect('/dashboard')

  // ── Month / year params ───────────────────────────────────────────────────
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

  // ── Data ──────────────────────────────────────────────────────────────────
  const data = await getFluxoDeCaixa(entityId!, month, year)

  return (
    <UpgradeGate feature="canAccessPJ">
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-2xl font-semibold text-gray-900">Fluxo de Caixa</h1>
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
              <Building2 className="w-3 h-3" />
              {entity.name}
            </span>
          </div>
          <p className="text-sm text-gray-400">Entradas e saídas da entidade empresarial</p>
        </div>
        <MonthNavigator month={month} year={year} basePath="/fluxo-de-caixa" />
      </div>

      {/* ── Summary Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Entradas do mês"
          value={formatCurrency(data.entriesTotal)}
          icon={<TrendingUp className="w-4 h-4" />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          valueColor="text-emerald-600"
        />
        <SummaryCard
          label="Saídas do mês"
          value={formatCurrency(data.expensesTotal)}
          icon={<TrendingDown className="w-4 h-4" />}
          iconBg="bg-red-50"
          iconColor="text-red-500"
          valueColor="text-red-600"
        />
        <SummaryCard
          label="Saldo do mês"
          value={formatCurrency(data.monthBalance)}
          icon={<ArrowLeftRight className="w-4 h-4" />}
          iconBg={data.monthBalance >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
          iconColor={data.monthBalance >= 0 ? 'text-emerald-600' : 'text-red-500'}
          valueColor={data.monthBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}
        />
        <SummaryCard
          label="Saldo acumulado"
          value={formatCurrency(data.accumulatedBalance)}
          icon={<BarChart3 className="w-4 h-4" />}
          iconBg={data.accumulatedBalance >= 0 ? 'bg-blue-50' : 'bg-red-50'}
          iconColor={data.accumulatedBalance >= 0 ? 'text-blue-600' : 'text-red-500'}
          valueColor={data.accumulatedBalance >= 0 ? 'text-blue-600' : 'text-red-600'}
          subtitle="Desde o início"
        />
      </div>

      {/* ── Client: Chart + Weekly Table ─────────────────────────────────── */}
      <FluxoDeCaixaClient
        monthlyData={data.monthlyData}
        weeklyGroups={data.weeklyGroups}
      />
    </div>
    </UpgradeGate>
  )
}

// ─── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, icon, iconBg, iconColor, valueColor, subtitle,
}: {
  label: string
  value: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  valueColor: string
  subtitle?: string
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
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  )
}
