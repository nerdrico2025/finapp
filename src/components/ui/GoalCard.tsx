'use client'

import { useEffect, useState } from 'react'
import { Pencil, Trash2, Target, CalendarClock, CheckCircle2, PlusCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import type { GoalWithProgress } from '@/lib/actions/goals'

function calcMonthsRemaining(targetDate: string): number {
  const today = new Date()
  const target = new Date(targetDate + 'T00:00:00')
  return (target.getFullYear() - today.getFullYear()) * 12 +
         (target.getMonth() - today.getMonth())
}

interface Props {
  goal: GoalWithProgress
  onContribute: () => void
  onEdit: () => void
  onDelete: () => void
  onComplete: () => void
}

export function GoalCard({ goal, onContribute, onEdit, onDelete, onComplete }: Props) {
  const isCompleted = goal.status === 'completed'
  const remaining = goal.target_amount - goal.current_amount
  const isOverdue = goal.days_remaining !== null && goal.days_remaining < 0

  const monthlySavingsMsg = (() => {
    if (isCompleted || !goal.target_date) return null
    if (goal.current_amount >= goal.target_amount) return { type: 'achieved' as const }
    const months = calcMonthsRemaining(goal.target_date)
    if (months <= 0) return { type: 'expired' as const }
    return { type: 'monthly' as const, amount: (goal.target_amount - goal.current_amount) / months }
  })()

  // Animate bar from 0 on mount
  const [barWidth, setBarWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setBarWidth(goal.percentage), 60)
    return () => clearTimeout(t)
  }, [goal.percentage])

  const accentColor = goal.color ?? '#10b981'

  const deadlineLabel = (() => {
    if (!goal.target_date) return null
    if (isOverdue) return { text: `${Math.abs(goal.days_remaining!)}d atrasado`, urgent: true }
    if (goal.days_remaining === 0) return { text: 'Vence hoje', urgent: true }
    if (goal.days_remaining === 1) return { text: 'Vence amanhã', urgent: false }
    if (goal.days_remaining! <= 30) return { text: `${goal.days_remaining}d restantes`, urgent: false }
    return { text: formatDate(goal.target_date), urgent: false }
  })()

  return (
    <div
      className={cn(
        'group relative bg-white rounded-2xl border overflow-hidden transition-shadow hover:shadow-md',
        isCompleted ? 'border-emerald-100' : 'border-gray-100'
      )}
    >
      {/* Color accent strip */}
      <div className="h-1 w-full" style={{ backgroundColor: accentColor }} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ backgroundColor: `${accentColor}18` }}
            >
              {goal.icon ?? <Target className="w-5 h-5" style={{ color: accentColor }} />}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-gray-900 leading-tight">{goal.name}</h3>
                {isCompleted && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                )}
              </div>
              {goal.description && (
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{goal.description}</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
            {!isCompleted && (
              <button
                onClick={onEdit}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Editar"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onDelete}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Excluir"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5 mb-4">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-500">Progresso</span>
            <span className={cn(
              'font-semibold',
              isCompleted ? 'text-emerald-600' : 'text-gray-700'
            )}>
              {Math.round(goal.percentage)}%
            </span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${barWidth}%`,
                backgroundColor: isCompleted ? '#10b981' : accentColor,
              }}
            />
          </div>
        </div>

        {/* Amounts */}
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-xs text-gray-400">Guardado</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums">
              {formatCurrency(goal.current_amount)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Meta</p>
            <p className="text-sm font-semibold text-gray-500 tabular-nums">
              {formatCurrency(goal.target_amount)}
            </p>
          </div>
        </div>

        {/* Monthly savings hint */}
        {monthlySavingsMsg && (
          <div className="mb-3 pt-2.5 border-t border-gray-50 text-center">
            {monthlySavingsMsg.type === 'achieved' ? (
              <p className="text-xs font-medium text-emerald-600">Meta atingida! 🎉</p>
            ) : monthlySavingsMsg.type === 'expired' ? (
              <p className="text-xs text-gray-400">Prazo encerrado</p>
            ) : (
              <p className="text-xs text-gray-500">
                Guardar{' '}
                <span className="font-semibold text-gray-900">
                  {formatCurrency(monthlySavingsMsg.amount)}/mês
                </span>
                {' '}para atingir a meta no prazo
              </p>
            )}
          </div>
        )}

        {/* Footer: deadline + actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {deadlineLabel && (
              <span className={cn(
                'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
                deadlineLabel.urgent
                  ? 'bg-red-100 text-red-700'
                  : 'bg-gray-100 text-gray-500'
              )}>
                <CalendarClock className="w-3 h-3" />
                {deadlineLabel.text}
              </span>
            )}
            {!isCompleted && remaining > 0 && (
              <span className="text-xs text-gray-400">
                faltam {formatCurrency(remaining)}
              </span>
            )}
          </div>

          {/* CTA */}
          {isCompleted ? (
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
              Concluída ✓
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              {goal.percentage >= 100 && (
                <button
                  onClick={onComplete}
                  className="text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                >
                  Marcar concluída
                </button>
              )}
              <button
                onClick={onContribute}
                className="flex items-center gap-1 text-xs font-medium text-white px-2.5 py-1 rounded-lg transition-colors"
                style={{ backgroundColor: accentColor }}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Contribuir
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
