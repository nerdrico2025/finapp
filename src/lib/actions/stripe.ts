'use server'

import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

export async function createCheckoutSession(
  priceId: string,
): Promise<{ url: string } | { error: string }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuário não autenticado.' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    let customerId = profile?.stripe_customer_id as string | undefined

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabaseUserId: user.id },
      })
      customerId = customer.id

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: process.env.NEXT_PUBLIC_APP_URL + '/subscription?success=true',
      cancel_url: process.env.NEXT_PUBLIC_APP_URL + '/pricing?canceled=true',
      metadata: { supabaseUserId: user.id },
      billing_address_collection: 'auto',
      locale: 'pt-BR',
    })

    return { url: session.url! }
  } catch {
    return { error: 'Erro ao iniciar checkout. Tente novamente.' }
  }
}

export async function createPortalSession(): Promise<{ url: string } | { error: string }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuário não autenticado.' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    const customerId = profile?.stripe_customer_id as string | undefined
    if (!customerId) return { error: 'Nenhuma assinatura encontrada.' }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: process.env.NEXT_PUBLIC_APP_URL + '/subscription',
    })

    return { url: session.url }
  } catch {
    return { error: 'Erro ao abrir portal. Tente novamente.' }
  }
}
