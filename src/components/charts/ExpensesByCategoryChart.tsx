'use client'

import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/utils/format'
import type { CategorySpending } from '@/lib/actions/dashboard'

interface Props {
  data: CategorySpending[]
}

const FALLBACK_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

const RADIAN = Math.PI / 180

// ─── Slice % label (inside each slice) ───────────────────────────────────────

interface SliceLabelProps {
  cx?: number
  cy?: number
  midAngle?: number
  innerRadius?: number
  outerRadius?: number
  percent?: number
}

function SliceLabel({ cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 }: SliceLabelProps) {
  if (percent < 0.05) return null
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
      style={{ pointerEvents: 'none' }}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

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

// ─── Legend ───────────────────────────────────────────────────────────────────

interface LegendEntry {
  value: string
  color: string
  payload?: { value: number; icon?: string | null }
}

function CustomLegend({ payload }: { payload?: LegendEntry[] }) {
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

export function ExpensesByCategoryChart({ data }: Props) {
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
            label={SliceLabel}
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
          <Legend content={<CustomLegend />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Center label — HTML overlay aligned with cy="45%" */}
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
        style={{ top: '45%' }}
      >
        <p className="text-[13px] font-bold text-gray-900 leading-tight">Total</p>
        <p className="text-[10px] text-gray-500 leading-tight mt-0.5">
          {formatCurrency(total)}
        </p>
      </div>
    </div>
  )
}
