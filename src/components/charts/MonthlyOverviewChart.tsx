'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/utils/format'
import type { MonthlyPoint } from '@/lib/actions/dashboard'

interface Props {
  data: MonthlyPoint[]
}

interface TooltipPayload {
  name: string
  value: number
  color: string
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm space-y-1.5">
      <p className="font-semibold text-gray-900 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="font-medium text-gray-900">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function yFormatter(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`
  return String(value)
}

export function MonthlyOverviewChart({ data }: Props) {
  const isEmpty = data.every((d) => d.income === 0 && d.expenses === 0)

  if (isEmpty) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-400">
        Nenhuma transação nos últimos 6 meses
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barGap={4} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={yFormatter}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
        <Legend
          formatter={(value) => (
            <span style={{ fontSize: 12, color: '#6b7280' }}>{value}</span>
          )}
        />
        <Bar dataKey="income"   name="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expenses" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
