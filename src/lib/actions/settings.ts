'use server'

import { revalidatePath } from 'next/cache'
import { resolveVisibleTradeTypes, type VisibleTradeTypes } from '@/lib/options/visible-trade-types'
import { createClient } from '@/lib/supabase/server'

export async function updateProfile(data: { full_name: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: data.full_name })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/settings/profile')
  return { error: null }
}

export async function updatePassword(data: { new_password: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase.auth.updateUser({ password: data.new_password })
  if (error) return { error: error.message }
  return { error: null }
}

export async function updatePreferences(data: { currency: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('profiles')
    .update({ currency: data.currency })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/settings/preferences')
  return { error: null }
}

export async function getVisibleTradeTypes(): Promise<VisibleTradeTypes> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return resolveVisibleTradeTypes(null)

  const { data } = await supabase
    .from('profiles')
    .select('show_swing_trades, show_option_trades')
    .eq('id', user.id)
    .single()

  return resolveVisibleTradeTypes(data)
}

export async function updateVisibleTradeTypes(data: { swing: boolean; options: boolean }) {
  if (!data.swing && !data.options) return { error: 'Mantenha pelo menos um tipo de operação visível.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('profiles')
    .update({ show_swing_trades: data.swing, show_option_trades: data.options })
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return { error: null }
}
