'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils/cn'

interface Props {
  current: number
  limit: number
  label?: string
}

export function BudgetProgressBar({ current, limit, label }: Props) {
  const rawPct = limit > 0 ? (current / limit) * 100 : 0
  const clampedPct = Math.min(rawPct, 100)
  const isOver = current > limit && limit > 0

  // Animate from 0 on mount
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setWidth(clampedPct), 50)
    return () => clearTimeout(t)
  }, [clampedPct])

  const barColor =
    isOver || rawPct >= 90 ? 'bg-red-500' :
    rawPct >= 70 ? 'bg-amber-400' :
    'bg-emerald-500'

  const trackColor =
    isOver || rawPct >= 90 ? 'bg-red-100' :
    rawPct >= 70 ? 'bg-amber-100' :
    'bg-emerald-100'

  const labelColor =
    isOver || rawPct >= 90 ? 'text-red-600 font-semibold' :
    rawPct >= 70 ? 'text-amber-600 font-medium' :
    'text-gray-500'

  return (
    <div className="space-y-1.5">
      {label !== undefined && (
        <div className="flex justify-between items-center text-xs">
          <span className="text-gray-500">{label}</span>
          <span className={cn(labelColor)}>
            {isOver ? `+${Math.round(rawPct - 100)}% excedido` : `${Math.round(rawPct)}%`}
          </span>
        </div>
      )}
      <div className={cn('h-2 rounded-full overflow-hidden', trackColor)}>
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-out', barColor)}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}
