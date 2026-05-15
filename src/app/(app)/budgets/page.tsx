import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Orçamentos' }

import { getBudgetsWithSpending } from '@/lib/actions/budgets'
import { getCategories } from '@/lib/actions/categories'
import { BudgetsClient } from './BudgetsClient'

interface Props {
  searchParams: Promise<{ month?: string; year?: string }>
}

export default async function BudgetsPage({ searchParams }: Props) {
  const params = await searchParams
  const now = new Date()
  const month = params.month ? parseInt(params.month) : now.getMonth() + 1
  const year  = params.year  ? parseInt(params.year)  : now.getFullYear()

  const [{ data: budgets }, { data: categories }] = await Promise.all([
    getBudgetsWithSpending(month, year),
    getCategories('expense'),
  ])

  return (
    <BudgetsClient
      budgets={budgets ?? []}
      categories={categories ?? []}
      month={month}
      year={year}
    />
  )
}
