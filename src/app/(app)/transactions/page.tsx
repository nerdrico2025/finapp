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

  const [
    { data: transactions, count },
    { data: accounts },
    { data: categories },
    summary,
  ] = await Promise.all([
    getTransactions({ month, year, type, categoryId, accountId, page, pageSize: 20 }),
    getAccounts(),
    getCategories(),
    getTransactionSummary({ month, year, categoryId, accountId }),
  ])

  return (
    <TransactionsClient
      transactions={transactions ?? []}
      totalCount={count}
      accounts={accounts ?? []}
      categories={categories ?? []}
      filters={{ month, year, type, categoryId, accountId, page }}
      totalIncome={summary.totalIncome}
      totalExpenses={summary.totalExpenses}
    />
  )
}
