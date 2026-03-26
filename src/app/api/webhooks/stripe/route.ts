import type Stripe from 'stripe'
import { stripe, syncSubscriptionToDb } from '@/lib/stripe'

function customerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!customer) return null
  return typeof customer === 'string' ? customer : customer.id
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: `Webhook signature verification failed: ${message}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const status = sub.status === 'active' ? 'pro' : 'free'
        const cid = customerId(sub.customer)
        if (cid) await syncSubscriptionToDb(cid, status, sub.id)
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const cid = customerId(sub.customer)
        if (cid) await syncSubscriptionToDb(cid, 'free', null)
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const cid = customerId(invoice.customer)
        if (cid) await syncSubscriptionToDb(cid, 'free', null)
        break
      }
      default:
        break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: `Webhook handler error: ${message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
