import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Alertas' }

import { getBillAlerts, getUpcomingAlerts } from '@/lib/actions/billAlerts'
import { AlertsClient } from './AlertsClient'

export default async function AlertsPage() {
  const [{ data: alerts }, { data: upcoming }] = await Promise.all([
    getBillAlerts(),
    getUpcomingAlerts(7),
  ])

  return (
    <AlertsClient
      alerts={alerts ?? []}
      upcoming={upcoming}
    />
  )
}
