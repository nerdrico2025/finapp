import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

// No-op in App Router (body is never auto-parsed here), kept for documentation.
export const config = { api: { bodyParser: false } }

function getPlanUpdates(subscription: Stripe.Subscription): {
  plan_type?: 'pro_pf' | 'pro_pj'
  plan_pf_active?: boolean
  plan_pj_active?: boolean
} {
  const updates: {
    plan_type?: 'pro_pf' | 'pro_pj'
    plan_pf_active?: boolean
    plan_pj_active?: boolean
  } = {}

  for (const item of subscription.items.data) {
    const priceId = item.price.id
    if (priceId === process.env.STRIPE_PRICE_PRO_PF) updates.plan_type = 'pro_pf'
    else if (priceId === process.env.STRIPE_PRICE_PRO_PJ) updates.plan_type = 'pro_pj'
    else if (priceId === process.env.STRIPE_PRICE_ADDON_PJ) updates.plan_pj_active = true
    else if (priceId === process.env.STRIPE_PRICE_ADDON_PF) updates.plan_pf_active = true
  }

  return updates
}

function getPeriodEnd(subscription: Stripe.Subscription): string | null {
  const firstItem = subscription.items.data[0]
  if (!firstItem?.current_period_end) return null
  return new Date(firstItem.current_period_end * 1000).toISOString()
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  const supabase = createAdminClient()

  // Idempotency check
  const { data: existing } = await supabase
    .from('stripe_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle()

  if (existing) return Response.json({ received: true })

  await supabase.from('stripe_events').insert({
    stripe_event_id: event.id,
    type: event.type,
    payload: event.data.object as never,
  })

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const supabaseUserId = session.metadata?.supabaseUserId
      if (!supabaseUserId || !session.subscription) break

      const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
      const planUpdates = getPlanUpdates(subscription)

      await supabase
        .from('profiles')
        .update({
          subscription_id: subscription.id,
          subscription_status: 'active',
          current_period_end: getPeriodEnd(subscription),
          ...planUpdates,
        })
        .eq('id', supabaseUserId)
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      const planUpdates = getPlanUpdates(subscription)

      await supabase
        .from('profiles')
        .update({
          subscription_status: subscription.status,
          current_period_end: getPeriodEnd(subscription),
          ...planUpdates,
        })
        .eq('stripe_customer_id', customerId)
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string

      await supabase
        .from('profiles')
        .update({
          subscription_status: 'canceled',
          plan_type: 'free',
          plan_pf_active: false,
          plan_pj_active: false,
        })
        .eq('stripe_customer_id', customerId)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string

      await supabase
        .from('profiles')
        .update({ subscription_status: 'past_due' })
        .eq('stripe_customer_id', customerId)
      break
    }

    default:
      break
  }

  return Response.json({ received: true })
}
