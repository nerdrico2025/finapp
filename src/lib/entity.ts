import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

export const ENTITY_COOKIE = 'finapp_entity_id'

/**
 * Resolves the active entity ID for a user.
 * Reads from the session cookie; falls back to the user's personal entity.
 * Returns null only if the user has no entities yet (pre-migration edge case).
 */
export async function getActiveEntityId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const cookieStore = await cookies()
  const fromCookie = cookieStore.get(ENTITY_COOKIE)?.value

  if (fromCookie) {
    // Validate via entity_members so shared entities are accepted too
    const { data } = await supabase
      .from('entity_members')
      .select('entity_id')
      .eq('entity_id', fromCookie)
      .eq('user_id', userId)
      .not('accepted_at', 'is', null)
      .maybeSingle()
    if (data?.entity_id) return data.entity_id
  }

  // Fallback: any entity the user owns (personal preferred, then any)
  const { data: owned } = await supabase
    .from('entities')
    .select('id, type')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })

  const personal = owned?.find((e) => e.type === 'personal') ?? owned?.[0]
  return personal?.id ?? null
}
