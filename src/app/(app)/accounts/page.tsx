import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Contas' }

import { getAccounts, getInactiveAccounts, getTotalBalance } from '@/lib/actions/accounts'
import { AccountsClient } from './AccountsClient'

export default async function AccountsPage() {
  const [{ data: accounts }, { data: inactiveAccounts }, { total }] = await Promise.all([
    getAccounts(),
    getInactiveAccounts(),
    getTotalBalance(),
  ])

  return (
    <AccountsClient
      accounts={accounts ?? []}
      inactiveAccounts={inactiveAccounts ?? []}
      totalBalance={total}
    />
  )
}
