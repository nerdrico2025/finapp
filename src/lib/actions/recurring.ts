'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { RecurrenceFrequency, TransactionType } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RuleWithRelations = {
  id: string
  user_id: string
  account_id: string
  category_id: string | null
  type: TransactionType
  amount: number
  name: string
  frequency: RecurrenceFrequency
  start_date: string
  end_date: string | null
  next_date: string
  last_generated_date: string | null
  is_active: boolean
  auto_create: boolean
  created_at: string
  updated_at: string
  account: { id: string; name: string; color: string | null } | null
  category: { id: string; name: string; icon: string | null; color: string | null } | null
}

export interface RecurringFormData {
  name: string
  type: TransactionType
  amount: number
  account_id: string
  category_id?: string | null
  frequency: RecurrenceFrequency
  start_date: string
  end_date?: string | null
  auto_create?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addPeriod(dateStr: string, frequency: RecurrenceFrequency): string {
  const d = new Date(dateStr + 'T12:00:00')
  switch (frequency) {
    case 'daily':     d.setDate(d.getDate() + 1);       break
    case 'weekly':    d.setDate(d.getDate() + 7);       break
    case 'biweekly':  d.setDate(d.getDate() + 14);      break
    case 'monthly':   d.setMonth(d.getMonth() + 1);     break
    case 'quarterly': d.setMonth(d.getMonth() + 3);     break
    case 'yearly':    d.setFullYear(d.getFullYear() + 1); break
  }
  return d.toISOString().split('T')[0]
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function getRecurringRules() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Não autenticado' }

  const { data, error } = await supabase
    .from('recurring_rules')
    .select(`
      *,
      account:accounts(id, name, color),
      category:categories(id, name, icon, color)
    `)
    .eq('user_id', user.id)
    .order('description')

  return {
    data: (data ?? []) as unknown as RuleWithRelations[],
    error: error?.message ?? null,
  }
}

export async function createRecurringRule(formData: RecurringFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase.from('recurring_rules').insert({
    user_id: user.id,
    account_id: formData.account_id,
    category_id: formData.category_id ?? null,
    type: formData.type,
    amount: formData.amount,
    name: formData.name,
    frequency: formData.frequency,
    start_date: formData.start_date,
    end_date: formData.end_date ?? null,
    next_date: formData.start_date,
    is_active: true,
    auto_create: formData.auto_create ?? true,
  })

  if (error) return { error: error.message }

  revalidatePath('/transactions/recurring')
  return { error: null }
}

export async function updateRecurringRule(id: string, formData: Partial<RecurringFormData>) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('recurring_rules')
    .update({
      ...(formData.name        !== undefined && { name: formData.name }),
      ...(formData.type        !== undefined && { type: formData.type }),
      ...(formData.amount      !== undefined && { amount: formData.amount }),
      ...(formData.account_id  !== undefined && { account_id: formData.account_id }),
      ...(formData.category_id !== undefined && { category_id: formData.category_id }),
      ...(formData.frequency   !== undefined && { frequency: formData.frequency }),
      ...(formData.start_date  !== undefined && { start_date: formData.start_date }),
      ...(formData.end_date    !== undefined && { end_date: formData.end_date }),
      ...(formData.auto_create !== undefined && { auto_create: formData.auto_create }),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/transactions/recurring')
  return { error: null }
}

export async function toggleRecurringRule(id: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: rule } = await supabase
    .from('recurring_rules')
    .select('is_active')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!rule) return { error: 'Regra não encontrada' }

  const { error } = await supabase
    .from('recurring_rules')
    .update({ is_active: !rule.is_active })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/transactions/recurring')
  return { error: null }
}

export async function deleteRecurringRule(id: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('recurring_rules')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/transactions/recurring')
  return { error: null }
}

export async function processRecurring(): Promise<{ generated: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { generated: 0 }

  const today = todayStr()

  const { data: rules } = await supabase
    .from('recurring_rules')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .lte('next_date', today)

  if (!rules || rules.length === 0) return { generated: 0 }

  let generated = 0

  for (const rule of rules) {
    // Skip if past end_date
    if (rule.end_date && rule.next_date > rule.end_date) continue

    let nextDate = rule.next_date
    let iterations = 0
    const MAX_ITERATIONS = 24

    while (nextDate <= today && iterations < MAX_ITERATIONS) {
      if (rule.end_date && nextDate > rule.end_date) break

      if (rule.auto_create) {
        const { data: account } = await supabase
          .from('accounts')
          .select('balance')
          .eq('id', rule.account_id)
          .single()

        const delta = rule.type === 'income' ? rule.amount : -rule.amount

        await Promise.all([
          supabase.from('transactions').insert({
            user_id: user.id,
            account_id: rule.account_id,
            category_id: rule.category_id,
            type: rule.type,
            amount: rule.amount,
            description: rule.name,
            date: nextDate,
            status: 'completed' as const,
            recurring_rule_id: rule.id,
          }),
          account
            ? supabase
                .from('accounts')
                .update({ balance: account.balance + delta })
                .eq('id', rule.account_id)
            : Promise.resolve(),
        ])

        generated++
      }

      nextDate = addPeriod(nextDate, rule.frequency)
      iterations++
    }

    await supabase
      .from('recurring_rules')
      .update({
        next_date: nextDate,
        last_generated_date: today,
      })
      .eq('id', rule.id)
  }

  if (generated > 0) {
    revalidatePath('/dashboard')
    revalidatePath('/transactions')
    revalidatePath('/accounts')
  }

  return { generated }
}
