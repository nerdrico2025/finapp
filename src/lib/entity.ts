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
    const { data } = await supabase
      .from('entities')
      .select('id')
      .eq('id', fromCookie)
      .eq('owner_id', userId)
      .maybeSingle()
    if (data?.id) return data.id
  }

  const { data } = await supabase
    .from('entities')
    .select('id')
    .eq('owner_id', userId)
    .eq('type', 'personal')
    .maybeSingle()

  return data?.id ?? null
}
