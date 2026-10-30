import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Investimentos' }

import { getInvestmentData, getInvestmentHistory } from '@/lib/actions/investments'
import { getTrades } from '@/lib/actions/trades'
import { getVisibleTradeTypes } from '@/lib/actions/settings'
import { getAccounts } from '@/lib/actions/accounts'
import { getCategories } from '@/lib/actions/categories'
import { InvestmentsClient } from './InvestmentsClient'

export default async function InvestmentsPage({ searchParams }: { searchParams: { encerrar?: string; aba?: string } }) {
  const [investmentData, { data: allAccounts }, { data: categories }, history, trades, visibleTradeTypes] = await Promise.all([
    getInvestmentData(),
    getAccounts(),
    getCategories(),
    getInvestmentHistory(),
    getTrades(),
    getVisibleTradeTypes(),
  ])

  return (
    <InvestmentsClient
      investmentData={investmentData}
      allAccounts={allAccounts ?? []}
      categories={categories ?? []}
      history={history}
      initialTrades={trades}
      visibleTradeTypes={visibleTradeTypes}
      closeOptionId={searchParams.encerrar}
      openOptionsTab={searchParams.aba === 'opcoes'}
    />
  )
}
