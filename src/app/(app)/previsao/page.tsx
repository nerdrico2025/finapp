import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Previsão Orçamentária' }

import { getPrevisaoData } from '@/lib/actions/previsao'
import { getCategories } from '@/lib/actions/categories'
import { PrevisaoClient } from './PrevisaoClient'

interface Props {
  searchParams: Promise<{ month?: string; year?: string }>
}

export default async function PrevisaoPage({ searchParams }: Props) {
  const params = await searchParams
  const now = new Date()
  const month = params.month ? parseInt(params.month) : now.getMonth() + 1
  const year  = params.year  ? parseInt(params.year)  : now.getFullYear()

  const [previsao, { data: categories }] = await Promise.all([
    getPrevisaoData(month, year),
    getCategories(),
  ])

  return (
    <PrevisaoClient
      transactions={previsao.transactions}
      budgets={previsao.budgets}
      chartData={previsao.chartData}
      categories={categories ?? []}
      month={month}
      year={year}
    />
  )
}
