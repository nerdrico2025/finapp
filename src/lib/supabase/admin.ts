import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types'

// Uses SUPABASE_SERVICE_ROLE_KEY — server-side only, never exposed to the browser.
// Add SUPABASE_SERVICE_ROLE_KEY to your .env.local to enable admin features.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
