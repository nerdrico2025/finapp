'use server'

import { createClient } from '@/lib/supabase/server'
import type { Account } from '@/types'

export interface InvestmentTransaction {
  id: string
  date: string
  description: string | null
  amount: number
  type: 'income' | 'expense' | 'transfer'
  account_id: string
  account_name: string
  category_name: string | null
  category_icon: string | null
  category_color: string | null
}

export interface InvestmentData {
  accounts: Account[]
  transactions: InvestmentTransaction[]
  total: number
}

export async function getInvestmentData(limit = 20): Promise<InvestmentData> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { accounts: [], transactions: [], total: 0 }

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('type', 'investment')
    .eq('is_active', true)
    .order('balance', { ascending: false })

  const investmentAccounts = (accounts ?? []) as Account[]

  if (investmentAccounts.length === 0) {
    return { accounts: [], transactions: [], total: 0 }
  }

  const accountIds = investmentAccounts.map((a) => a.id)

  const { data: txData } = await supabase
    .from('transactions')
    .select('id, date, description, amount, type, account_id, category:categories(name, icon, color)')
    .eq('user_id', user.id)
    .in('account_id', accountIds)
    .order('date', { ascending: false })
    .limit(limit)

  const accountMap = new Map(investmentAccounts.map((a) => [a.id, a]))

  type RawTx = {
    id: string; date: string; description: string | null; amount: number; type: string
    account_id: string; category: { name: string; icon: string | null; color: string | null } | null
  }

  const transactions: InvestmentTransaction[] = ((txData ?? []) as unknown as RawTx[]).map((tx) => {
    const cat = tx.category
    const account = accountMap.get(tx.account_id)
    return {
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      type: tx.type as 'income' | 'expense' | 'transfer',
      account_id: tx.account_id,
      account_name: account?.name ?? '',
      category_name: cat?.name ?? null,
      category_icon: cat?.icon ?? null,
      category_color: cat?.color ?? null,
    }
  })

  const total = investmentAccounts.reduce((s, a) => s + (a.balance ?? 0), 0)

  return { accounts: investmentAccounts, transactions, total }
}
