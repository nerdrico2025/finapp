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

interface TooltipPayloadItem {
  name: string
  value: number
  payload: CategorySpending
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

function CustomLegend({ payload }: { payload?: Array<{ value: string; color: string }> }) {
  if (!payload) return null
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-2">
      {payload.map((entry, i) => (
        <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          {entry.value}
        </li>
      ))}
    </ul>
  )
}

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
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="45%"
          innerRadius="40%"
          outerRadius="65%"
          paddingAngle={2}
          dataKey="value"
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
        {/* Center label */}
        <text
          x="50%"
          y="43%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-gray-900"
          style={{ fontSize: 13, fontWeight: 600 }}
        >
          Total
        </text>
        <text
          x="50%"
          y="51%"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize: 11, fill: '#6b7280' }}
        >
          {formatCurrency(total)}
        </text>
      </PieChart>
    </ResponsiveContainer>
  )
}
