'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import { upsertOptionExpiryEvents, deleteCalendarEvent } from '@/lib/google/calendar'
import {
  getOptionExpiryNotices,
  todayInBrazil,
  validateOption,
  type OptionExpiryNotice,
} from '@/lib/options/calc'
import { getOptionTargetNotices, validateTarget, type OptionTargetNotice } from '@/lib/options/target'
import type { OptionPosition, OptionStatus, TradeOperation } from '@/types'

export type TradeType = 'swing' | 'options'
export type TradeStatus = 'open' | 'closed'

export type CloseOptionData =
  | { outcome: 'closed'; exit_premium: number; exit_date: string }
  | { outcome: 'exercised'; underlying_price: number; exit_date: string }
  | { outcome: 'expired'; exit_date: string }

export interface TradeFormData {
  type: TradeType
  ticker: string            // swing: PETR4 (stock). options: PETR4 (underlying asset)
  entry_date: string
  exit_date?: string | null
  entry_price: number       // swing: price per share. options: not used (use premium)
  exit_price?: number | null
  quantity: number
  fees?: number
  status: TradeStatus
  notes?: string | null
  // Swing only
  stop_loss?: number | null
  target_price?: number | null
  // Options only
  option_series?: string | null   // e.g. PETRA100
  option_type?: 'call' | 'put' | null
  expiration_date?: string | null
  premium?: number | null         // premium per share for options
  option_status?: OptionStatus | null
  position?: OptionPosition
  strike?: number | null
}

function optionValidationError(formData: Partial<TradeFormData>): string | null {
  const { errors } = validateOption({
    quantity: formData.quantity ?? 0,
    strike: formData.strike ?? null,
    premium: formData.premium ?? 0,
  })
  if (errors[0]) return errors[0].message

  const [targetError] = validateTarget({
    position: formData.position ?? 'holder',
    premium: formData.premium ?? 0,
    targetPremium: formData.target_price ?? null,
    stopPremium: formData.stop_loss ?? null,
  })
  return targetError?.message ?? null
}

async function removeExpiryEvents(
  userId: string,
  eventIds: { google_event_id: string | null; google_reminder_event_id: string | null },
) {
  try {
    await Promise.all(
      [eventIds.google_event_id, eventIds.google_reminder_event_id]
        .filter((id): id is string => !!id)
        .map((id) => deleteCalendarEvent(userId, id)),
    )
  } catch { /* Google Calendar is optional */ }
}

export interface TradeFilters {
  type?: TradeType
  startDate?: string
  endDate?: string
}

export async function getTrades(filters: TradeFilters = {}): Promise<TradeOperation[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const entityId = await getActiveEntityId(supabase, user.id)

  let query = supabase
    .from('trade_operations')
    .select('*')
    .eq('user_id', user.id)
    .order('status', { ascending: true })        // open first
    .order('entry_date', { ascending: false })

  if (entityId) query = query.eq('entity_id', entityId)
  if (filters.type) query = query.eq('type', filters.type)
  if (filters.startDate) query = query.gte('entry_date', filters.startDate)
  if (filters.endDate) query = query.lte('entry_date', filters.endDate)

  const { data } = await query
  return (data ?? []) as TradeOperation[]
}

export async function createTrade(
  formData: TradeFormData
): Promise<{ error: string | null; id?: string }> {
  if (formData.type === 'options') {
    const validationError = optionValidationError(formData)
    if (validationError) return { error: validationError }
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const entityId = await getActiveEntityId(supabase, user.id)

  const { data, error } = await supabase
    .from('trade_operations')
    .insert({
      user_id: user.id,
      entity_id: entityId,
      type: formData.type,
      ticker: formData.ticker.toUpperCase(),
      entry_date: formData.entry_date,
      exit_date: formData.exit_date ?? null,
      entry_price: formData.entry_price,
      exit_price: formData.exit_price ?? null,
      quantity: formData.quantity,
      fees: formData.fees ?? 0,
      status: formData.status,
      notes: formData.notes ?? null,
      stop_loss: formData.stop_loss ?? null,
      target_price: formData.target_price ?? null,
      option_series: formData.option_series?.toUpperCase() ?? null,
      option_type: formData.option_type ?? null,
      expiration_date: formData.expiration_date ?? null,
      premium: formData.premium ?? null,
      option_status: formData.option_status ?? null,
      position: formData.position ?? 'holder',
      strike: formData.strike ?? null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (formData.type === 'options' && formData.expiration_date) {
    try {
      const { reminderEventId, dueEventId } = await upsertOptionExpiryEvents({
        userId: user.id,
        series: formData.option_series?.toUpperCase() || formData.ticker.toUpperCase(),
        expirationDate: formData.expiration_date,
        today: todayInBrazil(),
      })
      await supabase.from('trade_operations').update({
        google_event_id: dueEventId,
        google_reminder_event_id: reminderEventId,
      }).eq('id', data.id)
    } catch { /* Google Calendar is optional */ }
  }

  revalidatePath('/', 'layout')
  return { error: null, id: data.id }
}

export async function updateTrade(
  id: string,
  formData: Partial<TradeFormData>
): Promise<{ error: string | null }> {
  if (formData.type === 'options') {
    const validationError = optionValidationError(formData)
    if (validationError) return { error: validationError }
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: updated, error } = await supabase
    .from('trade_operations')
    .update({
      ...(formData.ticker !== undefined && { ticker: formData.ticker.toUpperCase() }),
      ...(formData.entry_date !== undefined && { entry_date: formData.entry_date }),
      ...('exit_date' in formData && { exit_date: formData.exit_date ?? null }),
      ...(formData.entry_price !== undefined && { entry_price: formData.entry_price }),
      ...('exit_price' in formData && { exit_price: formData.exit_price ?? null }),
      ...(formData.quantity !== undefined && { quantity: formData.quantity }),
      ...(formData.fees !== undefined && { fees: formData.fees }),
      ...(formData.status !== undefined && { status: formData.status }),
      ...('notes' in formData && { notes: formData.notes ?? null }),
      ...('stop_loss' in formData && { stop_loss: formData.stop_loss ?? null }),
      ...('target_price' in formData && { target_price: formData.target_price ?? null }),
      ...('option_series' in formData && { option_series: formData.option_series?.toUpperCase() ?? null }),
      ...('option_type' in formData && { option_type: formData.option_type ?? null }),
      ...('expiration_date' in formData && { expiration_date: formData.expiration_date ?? null }),
      ...('premium' in formData && { premium: formData.premium ?? null }),
      ...('option_status' in formData && { option_status: formData.option_status ?? null }),
      ...(formData.position !== undefined && { position: formData.position }),
      ...('strike' in formData && { strike: formData.strike ?? null }),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('type, ticker, option_series, option_status, expiration_date, google_event_id, google_reminder_event_id')
    .maybeSingle()

  if (error) return { error: error.message }

  if (updated?.type === 'options' && updated.option_status === 'open' && updated.expiration_date) {
    try {
      const { reminderEventId, dueEventId } = await upsertOptionExpiryEvents({
        userId: user.id,
        series: updated.option_series ?? updated.ticker,
        expirationDate: updated.expiration_date,
        today: todayInBrazil(),
        existingReminderEventId: updated.google_reminder_event_id,
        existingDueEventId: updated.google_event_id,
      })
      await supabase.from('trade_operations').update({
        google_event_id: dueEventId,
        google_reminder_event_id: reminderEventId,
      }).eq('id', id)
    } catch { /* Google Calendar is optional */ }
  }

  revalidatePath('/', 'layout')
  return { error: null }
}

export async function updateCurrentPremium(
  id: string,
  currentPremium: number,
): Promise<{ error: string | null; updatedAt?: string }> {
  if (!(currentPremium >= 0)) return { error: 'Informe o prêmio atual.' }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const updatedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('trade_operations')
    .update({ current_premium: currentPremium, current_premium_updated_at: updatedAt })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('type', 'options')
    .eq('option_status', 'open')
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Operação não encontrada ou já encerrada.' }

  revalidatePath('/', 'layout')
  return { error: null, updatedAt }
}

export async function closeOption(
  id: string,
  close: CloseOptionData,
): Promise<{ error: string | null }> {
  if (!close.exit_date) return { error: 'Informe a data de encerramento.' }
  if (close.outcome === 'closed' && !(close.exit_premium >= 0)) return { error: 'Informe o prêmio de saída.' }
  if (close.outcome === 'exercised' && !(close.underlying_price > 0)) return { error: 'Informe o preço da ação no exercício.' }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: events } = await supabase
    .from('trade_operations')
    .select('google_event_id, google_reminder_event_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  const { data, error } = await supabase
    .from('trade_operations')
    .update({
      status: 'closed',
      option_status: close.outcome,
      exit_date: close.exit_date,
      exit_price: close.outcome === 'closed' ? close.exit_premium : null,
      underlying_price_at_exercise: close.outcome === 'exercised' ? close.underlying_price : null,
      google_event_id: null,
      google_reminder_event_id: null,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('type', 'options')
    .eq('option_status', 'open')
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Operação não encontrada ou já encerrada.' }
  if (events) await removeExpiryEvents(user.id, events)

  revalidatePath('/', 'layout')
  return { error: null }
}

export async function getExpiringOptions(): Promise<OptionExpiryNotice[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const entityId = await getActiveEntityId(supabase, user.id)

  let query = supabase
    .from('trade_operations')
    .select('id, ticker, option_series, option_status, expiration_date')
    .eq('user_id', user.id)
    .eq('type', 'options')
    .eq('option_status', 'open')

  if (entityId) query = query.eq('entity_id', entityId)

  const { data } = await query
  return getOptionExpiryNotices(data ?? [], todayInBrazil())
}

export async function getOptionTargetAlerts(): Promise<OptionTargetNotice[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const entityId = await getActiveEntityId(supabase, user.id)

  let query = supabase
    .from('trade_operations')
    .select('*')
    .eq('user_id', user.id)
    .eq('type', 'options')
    .eq('option_status', 'open')
    .not('current_premium', 'is', null)

  if (entityId) query = query.eq('entity_id', entityId)

  const { data } = await query
  return getOptionTargetNotices((data ?? []) as TradeOperation[], todayInBrazil())
}

export async function deleteTrade(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: deleted, error } = await supabase
    .from('trade_operations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('google_event_id, google_reminder_event_id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (deleted) await removeExpiryEvents(user.id, deleted)

  revalidatePath('/', 'layout')
  return { error: null }
}
