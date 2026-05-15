'use server'

import { revalidatePath } from 'next/cache'
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
