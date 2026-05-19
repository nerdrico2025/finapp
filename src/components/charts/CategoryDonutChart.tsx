'use client'

import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import { formatCurrency } from '@/lib/utils/format'

export interface DonutItem {
  id: string
  name: string
  value: number
  color?: string | null
  icon?: string | null
}

interface Props {
  data: DonutItem[]
  emptyText?: string
  size?: number
  innerRadius?: number
  outerRadius?: number
}

const FALLBACK_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

const RADIAN = Math.PI / 180

interface SliceLabelProps {
  cx?: number
  cy?: number
  midAngle?: number
  innerRadius?: number
  outerRadius?: number
  percent?: number
}

function SliceLabel({
  cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0,
}: SliceLabelProps) {
  if (percent < 0.08) return null
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

interface TooltipPayloadItem {
  name: string
  value: number
  payload: DonutItem & { value: number }
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

export function CategoryDonutChart({
  data,
  emptyText = 'Nenhum dado no período',
  size = 320,
  innerRadius = 80,
  outerRadius = 140,
}: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-400 py-16">
        {emptyText}
      </div>
    )
  }

  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      {/* Chart */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <PieChart width={size} height={size}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
            label={SliceLabel}
            labelLine={false}
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.id || index}
                fill={entry.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]}
                stroke="white"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>

        {/* Center label */}
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
        {data.map((entry, index) => {
          const color = entry.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
          const pct = total > 0 ? (entry.value / total) * 100 : 0
          return (
            <div key={entry.id || index} className="flex items-center gap-3 min-w-0">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="flex-1 text-sm text-gray-700 truncate">
                {entry.icon ? `${entry.icon} ` : ''}{entry.name}
              </span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">
                {formatCurrency(entry.value)}
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
