import type { Metadata } from 'next'
import { SecurityClient } from './SecurityClient'

export const metadata: Metadata = { title: 'Segurança' }

export default function SecurityPage() {
  return <SecurityClient />
}
