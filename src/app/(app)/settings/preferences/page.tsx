import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PreferencesClient } from './PreferencesClient'
import type { Profile } from '@/types'

export const metadata: Metadata = { title: 'Preferências' }

export default async function PreferencesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('currency')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  return <PreferencesClient currency={(profile as Pick<Profile, 'currency'>).currency} />
}
