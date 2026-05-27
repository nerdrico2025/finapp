'use client'

import { Building2, User, TrendingUp, TrendingDown, Minus, ArrowUpDown, Layers } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ConsolidadoData, EntitySummary } from '@/lib/actions/consolidado'
import { cn } from '@/lib/utils/cn'

// ─── Currency helper ──────────────────────────────────────────────────────────

function fmt(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtShort(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `R$ ${(value / 1_000).toFixed(1)}k`
  return fmt(value)
}

// ─── Entity card ──────────────────────────────────────────────────────────────

function EntityCard({ summary }: { summary: EntitySummary }) {
  const isPersonal = summary.entityType === 'personal'
  const sign = summary.balance >= 0

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      {/* Entity header */}
      <div className="flex items-center gap-3 mb-4">
        <div className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden',
          isPersonal ? 'bg-emerald-50' : 'bg-blue-50'
        )}>
          {!isPersonal && summary.logoUrl ? (
            <img src={summary.logoUrl} alt={summary.entityName} className="w-full h-full object-cover" />
          ) : isPersonal ? (
            <User className="w-4.5 h-4.5 text-emerald-600" />
          ) : (
            <Building2 className="w-4.5 h-4.5 text-blue-600" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{summary.entityName}</p>
          <span className={cn(
            'text-[10px] font-semibold rounded px-1.5 py-0.5 leading-none',
            isPersonal ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
          )}>
            {isPersonal ? 'PF' : 'PJ'}
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[11px] text-gray-400 mb-0.5">Receitas</p>
          <p className="text-sm font-bold text-emerald-600 tabular-nums">{fmt(summary.income)}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400 mb-0.5">Despesas</p>
          <p className="text-sm font-bold text-red-500 tabular-nums">{fmt(summary.expenses)}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400 mb-0.5">Saldo</p>
          <p className={cn('text-sm font-bold tabular-nums', sign ? 'text-gray-900' : 'text-red-600')}>
            {fmt(summary.balance)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Totals card ──────────────────────────────────────────────────────────────

function TotalsCard({ totals }: { totals: ConsolidadoData['totals'] }) {
  const sign = totals.balance >= 0

  return (
    <div className={cn(
      'rounded-2xl border p-5',
      sign ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
    )}>
      <div className="flex items-center gap-2 mb-4">
        <ArrowUpDown className={cn('w-4 h-4', sign ? 'text-emerald-600' : 'text-red-500')} />
        <p className="text-sm font-semibold text-gray-800">Total Consolidado</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="flex items-center gap-1 mb-0.5">
            <TrendingUp className="w-3 h-3 text-emerald-600" />
            <p className="text-[11px] text-gray-500">Receitas</p>
          </div>
          <p className="text-base font-bold text-emerald-600 tabular-nums">{fmt(totals.income)}</p>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-0.5">
            <TrendingDown className="w-3 h-3 text-red-500" />
            <p className="text-[11px] text-gray-500">Despesas</p>
          </div>
          <p className="text-base font-bold text-red-500 tabular-nums">{fmt(totals.expenses)}</p>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-0.5">
            <Minus className={cn('w-3 h-3', sign ? 'text-emerald-600' : 'text-red-500')} />
            <p className="text-[11px] text-gray-500">Saldo</p>
          </div>
          <p className={cn('text-base font-bold tabular-nums', sign ? 'text-emerald-700' : 'text-red-600')}>
            {fmt(totals.balance)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Pró-labore card ──────────────────────────────────────────────────────────

function ProlaboreCard({ value }: { value: number }) {
  if (value <= 0) return null
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
        <span className="text-lg">💼</span>
      </div>
      <div>
        <p className="text-xs text-amber-700 font-medium mb-0.5">Pró-labore recebido neste mês</p>
        <p className="text-xl font-bold text-amber-800 tabular-nums">{fmt(value)}</p>
      </div>
    </div>
  )
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function ConsolidadoChart({ chartData }: { chartData: ConsolidadoData['chartData'] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <p className="text-sm font-semibold text-gray-900 mb-4">Últimos 6 meses — PF vs PJ</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} barSize={10} barGap={2} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={fmtShort}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            formatter={(value, name) => {
              const labels: Record<string, string> = {
                pfIncome: 'PF Receitas',
                pjIncome: 'PJ Receitas',
                pfExpenses: 'PF Despesas',
                pjExpenses: 'PJ Despesas',
              }
              const key = String(name ?? '')
              return [fmt(Number(value ?? 0)), labels[key] ?? key]
            }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          <Legend
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                pfIncome: 'PF Receitas',
                pjIncome: 'PJ Receitas',
                pfExpenses: 'PF Despesas',
                pjExpenses: 'PJ Despesas',
              }
              return <span style={{ fontSize: 11, color: '#6b7280' }}>{labels[value] ?? value}</span>
            }}
          />
          {/* Receitas: stacked PF + PJ */}
          <Bar dataKey="pfIncome"   name="pfIncome"   stackId="income"   fill="#6ee7b7" radius={[0,0,0,0]} />
          <Bar dataKey="pjIncome"   name="pjIncome"   stackId="income"   fill="#10b981" radius={[4,4,0,0]} />
          {/* Despesas: stacked PF + PJ */}
          <Bar dataKey="pfExpenses" name="pfExpenses" stackId="expenses" fill="#fca5a5" radius={[0,0,0,0]} />
          <Bar dataKey="pjExpenses" name="pjExpenses" stackId="expenses" fill="#ef4444" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-12 flex flex-col items-center justify-center text-center">
      <Layers className="w-10 h-10 text-gray-200 mb-3" />
      <p className="text-sm font-medium text-gray-500 mb-1">Sem dados para este período</p>
      <p className="text-xs text-gray-400">Adicione transações nas suas entidades para ver o consolidado.</p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  data: ConsolidadoData | null
  month: number
  year: number
}

export function ConsolidadoClient({ data }: Props) {
  if (!data) return <EmptyState />

  return (
    <div className="space-y-5">
      {/* Pró-labore highlight */}
      <ProlaboreCard value={data.prolabore} />

      {/* Total card */}
      <TotalsCard totals={data.totals} />

      {/* Entity cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.personal && <EntityCard summary={data.personal} />}
        {data.businesses.map(b => (
          <EntityCard key={b.entityId} summary={b} />
        ))}
      </div>

      {/* Chart */}
      <ConsolidadoChart chartData={data.chartData} />
    </div>
  )
}
