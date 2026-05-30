import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Investimentos' }

import { getInvestmentData, getInvestmentHistory } from '@/lib/actions/investments'
import { getAccounts } from '@/lib/actions/accounts'
import { getCategories } from '@/lib/actions/categories'
import { InvestmentsClient } from './InvestmentsClient'

export default async function InvestmentsPage() {
  const [investmentData, { data: allAccounts }, { data: categories }, history] = await Promise.all([
    getInvestmentData(),
    getAccounts(),
    getCategories(),
    getInvestmentHistory(),
  ])

  return (
    <InvestmentsClient
      investmentData={investmentData}
      allAccounts={allAccounts ?? []}
      categories={categories ?? []}
      history={history}
    />
  )
}
