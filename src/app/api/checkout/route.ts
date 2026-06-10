import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCheckoutSession } from '@/lib/actions/stripe'

export async function GET(request: NextRequest) {
  const price = request.nextUrl.searchParams.get('price')

  if (!price) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const result = await createCheckoutSession(price)

  if ('error' in result) {
    return NextResponse.redirect(new URL('/?error=checkout_failed', request.url))
  }

  return NextResponse.redirect(result.url)
}
