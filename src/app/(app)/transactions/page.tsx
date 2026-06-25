import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Transações' }

import { getTransactions, getTransactionSummary } from '@/lib/actions/transactions'
import { getAccounts } from '@/lib/actions/accounts'
import { getCategories } from '@/lib/actions/categories'
import { TransactionsClient } from './TransactionsClient'
import type { TransactionType } from '@/types'

interface SearchParams {
  month?: string
  year?: string
  type?: string
  categoryId?: string
  subIds?: string
  accountId?: string
  page?: string
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const now = new Date()
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth() + 1
  const year = searchParams.year ? parseInt(searchParams.year) : now.getFullYear()
  const page = searchParams.page ? parseInt(searchParams.page) : 1
  const type = (searchParams.type as TransactionType | 'all') ?? 'all'
  const categoryId = searchParams.categoryId
  const accountId = searchParams.accountId

  // Accounts + categories first — the category tree is needed to resolve the
  // two-level (parent + subcategory) filter before querying transactions.
  const [{ data: accounts }, { data: categories }] = await Promise.all([
    getAccounts(),
    getCategories(),
  ])
  const cats = categories ?? []

  // Two-level category filter: a parent category (categoryId) optionally
  // narrowed to a subset of its subcategories (subIds). When subIds is absent
  // the filter is "parent + all its children"; when present it is exactly the
  // listed subcategories (empty = match nothing).
  const childIds = categoryId
    ? cats.filter((c) => c.parent_id === categoryId).map((c) => c.id)
    : []
  const selectedSubIds =
    categoryId && searchParams.subIds !== undefined
      ? searchParams.subIds.split(',').filter((id) => childIds.includes(id))
      : null // null = all subcategories

  let categoryIds: string[] | undefined
  if (categoryId) {
    categoryIds = selectedSubIds !== null ? selectedSubIds : [categoryId, ...childIds]
  }

  const [{ data: transactions, count }, summary] = await Promise.all([
    getTransactions({ month, year, type, categoryIds, accountId, page, pageSize: 20 }),
    getTransactionSummary({ month, year, categoryIds, accountId }),
  ])

  return (
    <TransactionsClient
      transactions={transactions ?? []}
      totalCount={count}
      accounts={accounts ?? []}
      categories={cats}
      filters={{
        month,
        year,
        type,
        categoryId,
        subIds: selectedSubIds ?? undefined,
        accountId,
        page,
      }}
      totalIncome={summary.totalIncome}
      totalExpenses={summary.totalExpenses}
    />
  )
}
