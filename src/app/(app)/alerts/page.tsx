import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Alertas' }

import { Suspense } from 'react'
import { getBillAlerts, getUpcomingAlerts } from '@/lib/actions/billAlerts'
import { createClient } from '@/lib/supabase/server'
import { AlertsClient } from './AlertsClient'

export default async function AlertsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: alerts }, { data: upcoming }, { data: profile }] = await Promise.all([
    getBillAlerts(),
    getUpcomingAlerts(7),
    user
      ? supabase.from('profiles').select('google_refresh_token').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
  ])

  const googleConnected = !!profile?.google_refresh_token

  return (
    <Suspense fallback={null}>
      <AlertsClient
        alerts={alerts ?? []}
        upcoming={upcoming}
        googleConnected={googleConnected}
      />
    </Suspense>
  )
}
