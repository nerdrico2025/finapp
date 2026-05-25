'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { upsertCalendarEvent, deleteCalendarEvent } from '@/lib/google/calendar'
import type { BillAlert } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BillAlertFormData {
  name: string
  amount?: number | null
  day_of_month: number
  days_before: number
  is_active?: boolean
}

export type UpcomingAlert = BillAlert & {
  next_due_date: string
  days_until: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNextDueDate(dayOfMonth: number): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const thisMonth = new Date(today.getFullYear(), today.getMonth(), dayOfMonth)
  if (thisMonth >= today) return thisMonth.toISOString().split('T')[0]

  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth)
  return nextMonth.toISOString().split('T')[0]
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function getBillAlerts() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Não autenticado' }

  const { data, error } = await supabase
    .from('bill_alerts')
    .select('*')
    .eq('user_id', user.id)
    .order('day_of_month')

  return {
    data: (data ?? []) as BillAlert[],
    error: error?.message ?? null,
  }
}

export async function createBillAlert(formData: BillAlertFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: inserted, error } = await supabase.from('bill_alerts').insert({
    user_id: user.id,
    name: formData.name,
    amount: formData.amount ?? null,
    day_of_month: formData.day_of_month,
    days_before: formData.days_before,
    is_active: formData.is_active ?? true,
  }).select('id').single()

  if (error) return { error: error.message }

  try {
    const eventId = await upsertCalendarEvent({
      userId: user.id,
      alertId: inserted.id,
      name: formData.name,
      amount: formData.amount,
      dayOfMonth: formData.day_of_month,
      daysBefore: formData.days_before,
    })
    if (eventId) {
      await supabase.from('bill_alerts').update({ google_event_id: eventId }).eq('id', inserted.id)
    }
  } catch { /* Google Calendar is optional */ }

  revalidatePath('/alerts')
  return { error: null }
}

export async function updateBillAlert(id: string, formData: Partial<BillAlertFormData>) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: existing } = await supabase
    .from('bill_alerts')
    .select('name, amount, day_of_month, days_before, google_event_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  const { error } = await supabase
    .from('bill_alerts')
    .update({
      ...(formData.name         !== undefined && { name: formData.name }),
      ...(formData.amount       !== undefined && { amount: formData.amount }),
      ...(formData.day_of_month !== undefined && { day_of_month: formData.day_of_month }),
      ...(formData.days_before  !== undefined && { days_before: formData.days_before }),
      ...(formData.is_active    !== undefined && { is_active: formData.is_active }),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  if (existing) {
    try {
      const merged = { ...existing, ...formData }
      const eventId = await upsertCalendarEvent({
        userId: user.id,
        alertId: id,
        name: merged.name ?? existing.name,
        amount: merged.amount ?? existing.amount,
        dayOfMonth: merged.day_of_month ?? existing.day_of_month,
        daysBefore: merged.days_before ?? existing.days_before,
        existingEventId: existing.google_event_id,
      })
      if (eventId && eventId !== existing.google_event_id) {
        await supabase.from('bill_alerts').update({ google_event_id: eventId }).eq('id', id)
      }
    } catch { /* Google Calendar is optional */ }
  }

  revalidatePath('/alerts')
  return { error: null }
}

export async function toggleBillAlert(id: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: alert } = await supabase
    .from('bill_alerts')
    .select('is_active')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!alert) return { error: 'Alerta não encontrado' }

  const { error } = await supabase
    .from('bill_alerts')
    .update({ is_active: !alert.is_active })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/alerts')
  return { error: null }
}

export async function deleteBillAlert(id: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  try {
    const { data: alert } = await supabase
      .from('bill_alerts')
      .select('google_event_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (alert?.google_event_id) {
      await deleteCalendarEvent(user.id, alert.google_event_id)
    }
  } catch { /* Google Calendar is optional */ }

  const { error } = await supabase
    .from('bill_alerts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/alerts')
  return { error: null }
}

export async function getUpcomingAlerts(withinDays = 7): Promise<{ data: UpcomingAlert[] }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [] }

  const { data: alerts } = await supabase
    .from('bill_alerts')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (!alerts) return { data: [] }

  const upcoming = alerts
    .map((alert) => {
      const next_due_date = getNextDueDate(alert.day_of_month)
      const days_until = daysUntil(next_due_date)
      return { ...alert, next_due_date, days_until } as UpcomingAlert
    })
    .filter((a) => a.days_until >= 0 && a.days_until <= withinDays)
    .sort((a, b) => a.days_until - b.days_until)

  return { data: upcoming }
}
