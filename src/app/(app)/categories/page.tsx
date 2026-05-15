import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Categorias' }

import { getCategories } from '@/lib/actions/categories'
import { CategoriesClient } from './CategoriesClient'

export default async function CategoriesPage() {
  const [{ data: expenses }, { data: incomes }] = await Promise.all([
    getCategories('expense'),
    getCategories('income'),
  ])

  return (
    <CategoriesClient
      expenses={expenses ?? []}
      incomes={incomes ?? []}
    />
  )
}
