'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getPlanLimits } from '@/lib/plan'
import type { PlanLimits } from '@/lib/plan'
import type { Profile } from '@/types'

interface UsePlanResult {
  plan: Profile['plan_type'] | null
  limits: PlanLimits | null
  isPro: boolean
  isPF: boolean
  isPJ: boolean
  hasPJAddon: boolean
  hasPFAddon: boolean
  isLoading: boolean
}

export function usePlan(): UsePlanResult {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setIsLoading(false)
        return
      }
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          setProfile(data)
          setIsLoading(false)
        })
    })
  }, [])

  if (!profile) {
    return {
      plan: null,
      limits: null,
      isPro: false,
      isPF: false,
      isPJ: false,
      hasPJAddon: false,
      hasPFAddon: false,
      isLoading,
    }
  }

  return {
    plan: profile.plan_type,
    limits: getPlanLimits(profile),
    isPro: profile.plan_type !== 'free',
    isPF: profile.plan_type === 'pro_pf' || profile.plan_pj_active,
    isPJ: profile.plan_type === 'pro_pj' || profile.plan_pf_active,
    hasPJAddon: profile.plan_pj_active,
    hasPFAddon: profile.plan_pf_active,
    isLoading,
  }
}
