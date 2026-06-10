import { createClient } from '@/lib/supabase/server'
import { getPlanLimits, FREE_LIMITS, type PlanLimits } from '@/lib/plan'

export async function getUserPlanLimits(userId: string): Promise<PlanLimits> {
  try {
    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!profile) return FREE_LIMITS
    return getPlanLimits(profile)
  } catch {
    return FREE_LIMITS
  }
}
