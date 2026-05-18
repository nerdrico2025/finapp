import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { getUpcomingAlerts } from '@/lib/actions/billAlerts'
import type { Profile } from '@/types'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  console.log('[AppLayout] user.id:', user?.id)
  if (!user) redirect('/login')

  const [{ data: rawProfile }, { data: upcomingAlerts }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    getUpcomingAlerts(3),
  ])
  console.log('[AppLayout] rawProfile:', rawProfile)
  console.log('[AppLayout] upcomingAlerts:', upcomingAlerts)

  const profile = rawProfile
    ? { ...rawProfile, email: rawProfile.email || user.email || '' }
    : null

  const isAdmin = profile?.role === 'admin'

  return (
    <AppShell
      profile={profile as Profile | null}
      alertCount={upcomingAlerts.length}
      isAdmin={isAdmin}
    >
      {children}
    </AppShell>
  )
}
