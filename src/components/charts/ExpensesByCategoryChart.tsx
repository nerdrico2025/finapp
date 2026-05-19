'use client'

import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/utils/format'
import type { CategorySpending } from '@/lib/actions/dashboard'

interface Props {
  data: CategorySpending[]
  variant?: 'compact' | 'detailed'
}

const FALLBACK_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

const RADIAN = Math.PI / 180

// ─── Slice % label ────────────────────────────────────────────────────────────

interface SliceLabelProps {
  cx?: number
  cy?: number
  midAngle?: number
  innerRadius?: number
  outerRadius?: number
  percent?: number
}

function makeSliceLabel(minPercent: number) {
  return function SliceLabel({
    cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0,
  }: SliceLabelProps) {
    if (percent < minPercent) return null
    const radius = innerRadius + (outerRadius - innerRadius) * 0.55
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    return (
      <text
        x={x} y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight={700}
        style={{ pointerEvents: 'none' }}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    )
  }
}

const CompactSliceLabel  = makeSliceLabel(0.05)
const DetailedSliceLabel = makeSliceLabel(0.08)

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  name: string
  value: number
  payload: CategorySpending & { value: number }
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-900">
        {item.payload.icon ? `${item.payload.icon} ` : ''}{item.name}
      </p>
      <p className="text-gray-600 mt-0.5">{formatCurrency(item.value)}</p>
    </div>
  )
}

// ─── Compact Legend (inside Recharts, used in dashboard) ──────────────────────

interface LegendEntry {
  value: string
  color: string
  payload?: { value: number; icon?: string | null }
}

function CompactLegend({ payload }: { payload?: LegendEntry[] }) {
  if (!payload?.length) return null
  const total = payload.reduce((s, e) => s + (e.payload?.value ?? 0), 0)
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2 px-1">
      {payload.map((entry, i) => {
        const amount = entry.payload?.value ?? 0
        const pct = total > 0 ? Math.round((amount / total) * 100) : 0
        const icon = entry.payload?.icon
        return (
          <li key={i} className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            <span>{icon ? `${icon} ` : ''}{entry.value}</span>
            <span className="text-gray-400">— {formatCurrency(amount)} ({pct}%)</span>
          </li>
        )
      })}
    </ul>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ExpensesByCategoryChart({ data, variant = 'compact' }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-400">
        Nenhuma despesa no período
      </div>
    )
  }

  const total = data.reduce((s, d) => s + d.amount, 0)
  const chartData = data.map((item) => ({
    ...item,
    name: item.name,
    value: item.amount,
  }))

  // ── Detailed variant: 2-column layout, fixed-size chart ──────────────────

  if (variant === 'detailed') {
    const CHART_SIZE = 320

    return (
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Chart */}
        <div className="relative shrink-0" style={{ width: CHART_SIZE, height: CHART_SIZE }}>
          <PieChart width={CHART_SIZE} height={CHART_SIZE}>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={140}
              paddingAngle={2}
              dataKey="value"
              label={DetailedSliceLabel}
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={entry.category_id || index}
                  fill={entry.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]}
                  stroke="white"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>

          {/* Center label — centered in the donut hole */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Total</p>
              <p className="text-xl font-bold text-gray-900 tabular-nums leading-tight mt-0.5">
                {formatCurrency(total)}
              </p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 w-full space-y-3 max-h-[320px] overflow-y-auto pr-1">
          {chartData.map((entry, index) => {
            const color = entry.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
            const pct = total > 0 ? (entry.amount / total) * 100 : 0
            return (
              <div key={entry.category_id || index} className="flex items-center gap-3 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="flex-1 text-sm text-gray-700 truncate">
                  {entry.icon ? `${entry.icon} ` : ''}{entry.name}
                </span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">
                  {formatCurrency(entry.amount)}
                </span>
                <span className="text-xs text-gray-400 w-10 text-right shrink-0">
                  {pct.toFixed(1)}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Compact variant: legend below chart (dashboard) ───────────────────────

  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            innerRadius="38%"
            outerRadius="62%"
            paddingAngle={2}
            dataKey="value"
            label={CompactSliceLabel}
            labelLine={false}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={entry.category_id || index}
                fill={entry.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]}
                stroke="white"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CompactLegend />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Center label */}
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
        style={{ top: '45%' }}
      >
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Total</p>
        <p className="text-sm font-bold text-gray-900 tabular-nums leading-tight mt-0.5">
          {formatCurrency(total)}
        </p>
      </div>
    </div>
  )
}
