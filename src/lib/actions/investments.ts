'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
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

// ─── updateInvestmentBalance ──────────────────────────────────────────────────

export interface UpdateBalanceResult {
  error: string | null
  diff?: number
  newBalance?: number
}

export async function updateInvestmentBalance(
  accountId: string,
  newBalance: number
): Promise<UpdateBalanceResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: account } = await supabase
    .from('accounts')
    .select('balance, type, entity_id')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single()

  if (!account) return { error: 'Conta não encontrada' }
  if (account.type !== 'investment') return { error: 'Conta não é do tipo investimento' }

  const diff = newBalance - (account.balance ?? 0)
  if (Math.abs(diff) < 0.01) return { error: null, diff: 0, newBalance: account.balance }

  const entityId = account.entity_id ?? (await getActiveEntityId(supabase, user.id))

  const { data: category } = await supabase
    .from('categories')
    .select('id')
    .eq('entity_id', entityId!)
    .eq('name', 'Rendimentos')
    .maybeSingle()

  const today = new Date().toISOString().split('T')[0]

  const { error } = await supabase.from('transactions').insert({
    user_id: user.id,
    entity_id: entityId,
    account_id: accountId,
    category_id: category?.id ?? null,
    type: diff > 0 ? 'income' : 'expense',
    amount: Math.abs(diff),
    description: 'Atualização de rentabilidade',
    date: today,
    status: 'completed',
    is_mirror: false,
  })

  if (error) return { error: error.message }

  revalidatePath('/investments')
  revalidatePath('/accounts')
  revalidatePath('/dashboard')

  return { error: null, diff, newBalance }
}

// ─── getInvestmentHistory ─────────────────────────────────────────────────────

export interface HistoryPoint {
  month: string
  label: string
  [accountId: string]: number | string
}

export async function getInvestmentHistory(): Promise<{
  points: HistoryPoint[]
  accountIds: string[]
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { points: [], accountIds: [] }

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, initial_balance')
    .eq('user_id', user.id)
    .eq('type', 'investment')
    .eq('is_active', true)

  if (!accounts || accounts.length === 0) return { points: [], accountIds: [] }

  const accountIds = accounts.map((a) => a.id)

  const { data: txData } = await supabase
    .from('transactions')
    .select('account_id, type, amount, date')
    .eq('user_id', user.id)
    .eq('is_mirror', false)
    .in('account_id', accountIds)
    .in('type', ['income', 'expense'])
    .order('date', { ascending: true })

  // Build monthly running balance per account (last 13 months)
  const now = new Date()
  const months: string[] = []
  for (let i = 12; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // Running balance starts at initial_balance for each account
  const running: Record<string, number> = {}
  for (const a of accounts) {
    running[a.id] = a.initial_balance ?? 0
  }

  // Accumulate transactions before the first month
  const firstMonth = months[0]
  for (const tx of txData ?? []) {
    const txMonth = tx.date.slice(0, 7)
    if (txMonth < firstMonth) {
      running[tx.account_id] += tx.type === 'income' ? tx.amount : -tx.amount
    }
  }

  // Group transactions by month
  const txByMonth: Record<string, typeof txData> = {}
  for (const tx of txData ?? []) {
    const m = tx.date.slice(0, 7)
    if (!txByMonth[m]) txByMonth[m] = []
    txByMonth[m]!.push(tx)
  }

  const points: HistoryPoint[] = months.map((m) => {
    const [y, mo] = m.split('-').map(Number)
    const label = new Date(y, mo - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })

    for (const tx of txByMonth[m] ?? []) {
      running[tx.account_id] += tx.type === 'income' ? tx.amount : -tx.amount
    }

    const point: HistoryPoint = { month: m, label }
    for (const id of accountIds) {
      point[id] = running[id] ?? 0
    }
    return point
  })

  return { points, accountIds }
}
