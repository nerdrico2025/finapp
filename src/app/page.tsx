// ⚠️  DELETE THIS FILE after confirming the landing page works.
//     Both this file and app/(marketing)/page.tsx resolve to '/' — Next.js
//     throws a build error when both exist. Run: rm src/app/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')
  // Non-authenticated: landing page is in app/(marketing)/page.tsx.
  // Delete this file so it can be served at '/'.
  redirect('/login')
}
