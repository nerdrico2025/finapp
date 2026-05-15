import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { getUpcomingAlerts } from '@/lib/actions/billAlerts'
import type { Profile } from '@/types'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: upcomingAlerts }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    getUpcomingAlerts(3),
  ])

  const isAdmin = (profile as { role?: string } | null)?.role === 'admin'

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
