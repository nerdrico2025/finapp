import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Recorrências' }

import { getRecurringRules } from '@/lib/actions/recurring'
import { getAccounts } from '@/lib/actions/accounts'
import { getCategories } from '@/lib/actions/categories'
import { RecurringClient } from './RecurringClient'

export default async function RecurringPage() {
  const [{ data: rules }, { data: accounts }, { data: categories }] = await Promise.all([
    getRecurringRules(),
    getAccounts(),
    getCategories(),
  ])

  return (
    <RecurringClient
      rules={rules ?? []}
      accounts={accounts ?? []}
      categories={categories ?? []}
    />
  )
}
