import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Contas' }

import { getAccounts, getTotalBalance } from '@/lib/actions/accounts'
import { AccountsClient } from './AccountsClient'

export default async function AccountsPage() {
  const [{ data: accounts }, { total }] = await Promise.all([
    getAccounts(),
    getTotalBalance(),
  ])

  return <AccountsClient accounts={accounts ?? []} totalBalance={total} />
}
