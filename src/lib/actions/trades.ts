'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import type { TradeOperation } from '@/types'

export type TradeType = 'swing' | 'options'
export type TradeStatus = 'open' | 'closed'
export type OptionStatus = 'open' | 'exercised' | 'expired' | 'closed'

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
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/investments')
  return { error: null, id: data.id }
}

export async function updateTrade(
  id: string,
  formData: Partial<TradeFormData>
): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
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
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/investments')
  return { error: null }
}

export async function deleteTrade(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('trade_operations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/investments')
  return { error: null }
}
