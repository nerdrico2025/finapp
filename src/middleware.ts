import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isAppRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/transactions') ||
    pathname.startsWith('/accounts') ||
    pathname.startsWith('/categories') ||
    pathname.startsWith('/budgets') ||
    pathname.startsWith('/goals') ||
    pathname.startsWith('/alerts') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/investments') ||
    pathname.startsWith('/lista-de-sonhos') ||
    pathname.startsWith('/fluxo-de-caixa') ||
    pathname.startsWith('/dre') ||
    pathname.startsWith('/consolidado') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/admin')

  const isAuthRoute = pathname === '/login' || pathname === '/register'

  if (isAppRoute && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (isAuthRoute && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // ── PJ-only route protection ─────────────────────────────────────────────────
  // /fluxo-de-caixa and /dre require an active business entity.
  // /consolidado is handled at the page level (needs any business entity, not just active).
  const isPjOnlyRoute = pathname.startsWith('/fluxo-de-caixa') || pathname.startsWith('/dre')

  if (isPjOnlyRoute && user) {
    const entityId = request.cookies.get('finapp_entity_id')?.value

    if (entityId) {
      const { data: entity } = await supabase
        .from('entities')
        .select('type')
        .eq('id', entityId)
        .eq('owner_id', user.id)
        .maybeSingle()

      if (!entity || entity.type !== 'business') {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        url.searchParams.set('notice', 'pj_required')
        return NextResponse.redirect(url)
      }
    } else {
      // No entity cookie — redirect to dashboard to let the app set one
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      url.searchParams.set('notice', 'pj_required')
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
