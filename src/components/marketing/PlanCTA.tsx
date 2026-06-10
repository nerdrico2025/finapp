'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createCheckoutSession } from '@/lib/actions/stripe'

interface PlanCTAProps {
  priceId: string
  planSlug: 'pro_pf' | 'pro_pj'
  label: string
  className?: string
}

export function PlanCTA({ priceId, planSlug, label, className }: PlanCTAProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleClick() {
    setLoading(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push(`/signup?plan=${planSlug}`)
        return
      }

      const result = await createCheckoutSession(priceId)
      if ('error' in result) {
        alert(result.error)
        return
      }
      window.location.href = result.url
    } catch {
      alert('Erro inesperado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button onClick={handleClick} disabled={loading} className={className}>
      {loading ? 'Aguarde...' : label}
    </button>
  )
}
