'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'
import { MonthlyOverviewChart } from '@/components/charts/MonthlyOverviewChart'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import type { WeekGroup, FluxoDeCaixaData } from '@/lib/actions/fluxoDeCaixa'

interface Props {
  monthlyData: FluxoDeCaixaData['monthlyData']
  weeklyGroups: WeekGroup[]
}

export function FluxoDeCaixaClient({ monthlyData, weeklyGroups }: Props) {
  return (
    <div className="space-y-6">
      {/* ── Bar Chart ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          Entradas vs Saídas — últimos 6 meses
        </h2>
        <div className="h-64">
          <MonthlyOverviewChart data={monthlyData} />
        </div>
      </div>

      {/* ── Weekly Table ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-900">Movimentações por semana</h2>
        </div>

        {weeklyGroups.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            Nenhuma movimentação neste período.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {weeklyGroups.map((group) => (
              <WeekSection key={group.week} group={group} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Week Section ──────────────────────────────────────────────────────────────

function WeekSection({ group }: { group: WeekGroup }) {
  const net = group.incomeTotal - group.expenseTotal

  return (
    <div>
      {/* Week header */}
      <div className="px-5 py-3 bg-gray-50/70 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-gray-700">{group.label}</span>
          <span className="text-xs text-gray-400">{group.dateRange}</span>
        </div>
        <div className="flex items-center gap-4 text-xs tabular-nums">
          <span className="flex items-center gap-1 text-emerald-600 font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            {formatCurrency(group.incomeTotal)}
          </span>
          <span className="flex items-center gap-1 text-red-500 font-medium">
            <TrendingDown className="w-3.5 h-3.5" />
            {formatCurrency(group.expenseTotal)}
          </span>
          <span className={cn(
            'font-semibold',
            net >= 0 ? 'text-emerald-600' : 'text-red-600'
          )}>
            {net >= 0 ? '+' : ''}{formatCurrency(net)}
          </span>
        </div>
      </div>

      {/* Transactions */}
      <ul className="divide-y divide-gray-50">
        {group.transactions.map((tx) => (
          <li key={tx.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/40 transition-colors">
            {/* Category icon */}
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

            {/* Description + meta */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {tx.description ?? tx.category?.name ?? '—'}
              </p>
              <p className="text-xs text-gray-400">
                {formatDate(tx.date)}
                {tx.account && (
                  <>
                    <span className="mx-1">·</span>
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
                      style={{ backgroundColor: tx.account.color ?? '#94a3b8' }}
                    />
                    {tx.account.name}
                  </>
                )}
              </p>
            </div>

            {/* Amount */}
            <p className={cn(
              'text-sm font-semibold tabular-nums shrink-0',
              tx.type === 'income' ? 'text-emerald-600' : 'text-red-600'
            )}>
              {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
