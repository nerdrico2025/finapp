'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import type { RecurrenceFrequency, TransactionType } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RuleWithRelations = {
  id: string
  user_id: string
  entity_id: string | null
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
  bill_alert_id: string | null
  created_at: string
  updated_at: string
  account: { id: string; name: string; color: string | null } | null
  category: { id: string; name: string; icon: string | null; color: string | null } | null
  bill_alert: { id: string; days_before: number; end_date: string | null } | null
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
  create_alert?: boolean
  alert_days_before?: number
  alert_end_date?: string | null
  remove_alert?: boolean
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

  const entityId = await getActiveEntityId(supabase, user.id)

  let query = supabase
    .from('recurring_rules')
    .select(`
      *,
      account:accounts(id, name, color),
      category:categories(id, name, icon, color),
      bill_alert:bill_alerts(id, days_before, end_date)
    `)
    .eq('user_id', user.id)
    .order('description')

  if (entityId) query = query.eq('entity_id', entityId)

  const { data, error } = await query

  return {
    data: (data ?? []) as unknown as RuleWithRelations[],
    error: error?.message ?? null,
  }
}

export async function createRecurringRule(formData: RecurringFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const entityId = await getActiveEntityId(supabase, user.id)

  const { data: rule, error } = await supabase.from('recurring_rules').insert({
    user_id: user.id,
    entity_id: entityId,
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
  }).select('id').single()

  if (error) return { error: error.message }

  if (formData.create_alert && rule) {
    const dayOfMonth = parseInt(formData.start_date.split('-')[2])
    const { data: alert } = await supabase.from('bill_alerts').insert({
      user_id: user.id,
      entity_id: entityId,
      name: formData.name,
      amount: formData.amount,
      day_of_month: dayOfMonth,
      days_before: formData.alert_days_before ?? 3,
      end_date: formData.alert_end_date ?? null,
      is_active: true,
    }).select('id').single()

    if (alert) {
      await supabase.from('recurring_rules')
        .update({ bill_alert_id: alert.id })
        .eq('id', rule.id)
    }
  }

  revalidatePath('/transactions/recurring')
  return { error: null }
}

export async function updateRecurringRule(id: string, formData: Partial<RecurringFormData>) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: currentRule } = await supabase
    .from('recurring_rules')
    .select('frequency, bill_alert_id, start_date')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  let nextDate: string | undefined
  if (formData.start_date !== undefined) {
    const today = todayStr()
    const frequency = formData.frequency ?? currentRule?.frequency as RecurrenceFrequency | undefined

    if (formData.start_date >= today) {
      nextDate = formData.start_date
    } else {
      let d = formData.start_date
      while (d < today) d = addPeriod(d, frequency ?? 'monthly')
      nextDate = d
    }
  }

  const entityId = await getActiveEntityId(supabase, user.id)

  let billAlertUpdate: { bill_alert_id: string | null } | undefined

  if (formData.remove_alert === true && currentRule?.bill_alert_id) {
    await supabase.from('bill_alerts').delete().eq('id', currentRule.bill_alert_id)
    billAlertUpdate = { bill_alert_id: null }
  } else if (formData.create_alert === true) {
    const startDate = formData.start_date ?? currentRule?.start_date ?? ''
    const dayOfMonth = parseInt(startDate.split('-')[2] || '1')

    if (currentRule?.bill_alert_id) {
      await supabase.from('bill_alerts').update({
        ...(formData.name !== undefined && { name: formData.name }),
        ...(formData.amount !== undefined && { amount: formData.amount }),
        day_of_month: dayOfMonth,
        days_before: formData.alert_days_before ?? 3,
        end_date: formData.alert_end_date ?? null,
      }).eq('id', currentRule.bill_alert_id)
    } else {
      const { data: alert } = await supabase.from('bill_alerts').insert({
        user_id: user.id,
        entity_id: entityId,
        name: formData.name ?? '',
        amount: formData.amount ?? null,
        day_of_month: dayOfMonth,
        days_before: formData.alert_days_before ?? 3,
        end_date: formData.alert_end_date ?? null,
        is_active: true,
      }).select('id').single()

      if (alert) billAlertUpdate = { bill_alert_id: alert.id }
    }
  }

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
      ...(nextDate             !== undefined && { next_date: nextDate }),
      ...billAlertUpdate,
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
    .eq('auto_create', true)
    .lte('next_date', today)

  if (!rules || rules.length === 0) return { generated: 0 }

  let generated = 0

  for (const rule of rules) {
    if (rule.end_date && rule.next_date > rule.end_date) continue

    let nextDate = rule.next_date
    let iterations = 0
    const MAX_ITERATIONS = 24

    while (nextDate <= today && iterations < MAX_ITERATIONS) {
      if (rule.end_date && nextDate > rule.end_date) break

      const { count } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('recurring_rule_id', rule.id)
        .eq('date', nextDate)

      if (!count || count === 0) {
        const { error: txError } = await supabase.from('transactions').insert({
          user_id: user.id,
          entity_id: rule.entity_id ?? null,
          account_id: rule.account_id,
          category_id: rule.category_id,
          type: rule.type,
          amount: rule.amount,
          description: rule.name,
          date: nextDate,
          status: 'completed' as const,
          recurring_rule_id: rule.id,
        })

        if (!txError) generated++
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
