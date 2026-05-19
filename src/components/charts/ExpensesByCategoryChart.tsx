'use client'

import { CategoryDonutChart } from './CategoryDonutChart'
import type { CategorySpending } from '@/lib/actions/dashboard'

interface Props {
  data: CategorySpending[]
}

export function ExpensesByCategoryChart({ data }: Props) {
  const items = data.map((c) => ({
    id: c.category_id,
    name: c.name,
    value: c.amount,
    color: c.color,
    icon: c.icon,
  }))

  return (
    <CategoryDonutChart
      data={items}
      emptyText="Nenhuma despesa no período"
    />
  )
}
