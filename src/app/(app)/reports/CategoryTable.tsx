'use client'

import { useState, Fragment } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/format'
import type { CategorySpending } from '@/lib/actions/dashboard'
import type { BudgetWithSpending } from '@/lib/actions/budgets'

interface ExpenseTableProps {
  data: CategorySpending[]
  total: number
  budgetMap: Map<string, BudgetWithSpending>
}

export function ExpenseCategoryTable({ data, total, budgetMap }: ExpenseTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (data.length === 0) {
    return <div className="py-10 text-center text-sm text-gray-400">Nenhuma despesa neste período.</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-50">
            <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">Categoria</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Valor</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">% total</th>
            <th className="px-5 py-3 text-xs font-medium text-gray-400 min-w-[200px]">vs Orçamento</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.map((cat) => {
            const pct = total > 0 ? (cat.amount / total) * 100 : 0
            const budget = budgetMap.get(cat.category_id)
            const budgetPct = budget ? (cat.amount / budget.amount) * 100 : null
            const barColor = budgetPct === null ? '#10b981' : budgetPct > 90 ? '#ef4444' : budgetPct > 70 ? '#f59e0b' : '#10b981'
            const hasChildren = (cat.children?.length ?? 0) > 0
            const isExpanded = expanded.has(cat.category_id)

            return (
              <Fragment key={cat.category_id}>
                <tr
                  className={cn('hover:bg-gray-50/50 transition-colors', hasChildren && 'cursor-pointer')}
                  onClick={hasChildren ? () => toggle(cat.category_id) : undefined}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      {hasChildren && (
                        <ChevronRight className={cn('w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-150', isExpanded && 'rotate-90')} />
                      )}
                      {!hasChildren && <span className="w-3.5 h-3.5 shrink-0" />}
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                        style={{ backgroundColor: cat.color ? `${cat.color}20` : '#f1f5f9' }}
                      >
                        {cat.icon ?? '·'}
                      </div>
                      <span className="font-medium text-gray-900">{cat.name}</span>
                      {hasChildren && (
                        <span className="text-xs text-gray-400">({cat.children!.length})</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-red-600">
                    {formatCurrency(cat.amount)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-gray-500">{pct.toFixed(1)}%</td>
                  <td className="px-5 py-3.5">
                    {budget ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(budgetPct ?? 0, 100)}%`, backgroundColor: barColor }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 shrink-0 tabular-nums">{(budgetPct ?? 0).toFixed(0)}%</span>
                        </div>
                        <p className="text-xs text-gray-400">de {formatCurrency(budget.amount)}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">Sem orçamento</span>
                    )}
                  </td>
                </tr>

                {/* Subcategory rows */}
                {hasChildren && isExpanded && cat.children!.map((sub) => {
                  const subPct = total > 0 ? (sub.amount / total) * 100 : 0
                  return (
                    <tr key={sub.category_id} className="bg-gray-50/40 hover:bg-gray-50 transition-colors">
                      <td className="pl-16 pr-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-md flex items-center justify-center text-xs shrink-0"
                            style={{ backgroundColor: sub.color ? `${sub.color}15` : '#f1f5f9' }}
                          >
                            {sub.icon ?? '·'}
                          </div>
                          <span className="text-sm text-gray-600">{sub.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-sm text-red-500">
                        {formatCurrency(sub.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-400">{subPct.toFixed(1)}%</td>
                      <td className="px-5 py-2.5" />
                    </tr>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

interface IncomeTableProps {
  data: CategorySpending[]
  total: number
}

export function IncomeCategoryTable({ data, total }: IncomeTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (data.length === 0) {
    return <div className="py-10 text-center text-sm text-gray-400">Nenhuma receita neste período.</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-50">
            <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">Categoria</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Valor</th>
            <th className="text-right px-5 py-3 text-xs font-medium text-gray-400">% total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.map((cat) => {
            const pct = total > 0 ? (cat.amount / total) * 100 : 0
            const hasChildren = (cat.children?.length ?? 0) > 0
            const isExpanded = expanded.has(cat.category_id)

            return (
              <Fragment key={cat.category_id}>
                <tr
                  className={cn('hover:bg-gray-50/50 transition-colors', hasChildren && 'cursor-pointer')}
                  onClick={hasChildren ? () => toggle(cat.category_id) : undefined}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      {hasChildren && (
                        <ChevronRight className={cn('w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-150', isExpanded && 'rotate-90')} />
                      )}
                      {!hasChildren && <span className="w-3.5 h-3.5 shrink-0" />}
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                        style={{ backgroundColor: cat.color ? `${cat.color}20` : '#f1f5f9' }}
                      >
                        {cat.icon ?? '·'}
                      </div>
                      <span className="font-medium text-gray-900">{cat.name}</span>
                      {hasChildren && <span className="text-xs text-gray-400">({cat.children!.length})</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-emerald-600">
                    {formatCurrency(cat.amount)}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-gray-500 tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>

                {hasChildren && isExpanded && cat.children!.map((sub) => {
                  const subPct = total > 0 ? (sub.amount / total) * 100 : 0
                  return (
                    <tr key={sub.category_id} className="bg-gray-50/40 hover:bg-gray-50 transition-colors">
                      <td className="pl-16 pr-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-md flex items-center justify-center text-xs shrink-0"
                            style={{ backgroundColor: sub.color ? `${sub.color}15` : '#f1f5f9' }}
                          >
                            {sub.icon ?? '·'}
                          </div>
                          <span className="text-sm text-gray-600">{sub.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-sm text-emerald-500">
                        {formatCurrency(sub.amount)}
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${subPct}%` }} />
                          </div>
                          <span className="text-gray-400 tabular-nums w-10 text-right text-xs">{subPct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
