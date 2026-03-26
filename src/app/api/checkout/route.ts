import { auth, currentUser } from '@clerk/nextjs/server'
import { getOrCreateStripeCustomer, stripe, PRICE_ID } from '@/lib/stripe'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.kaminify.com'

export async function POST(): Promise<Response> {
  const { userId } = await auth()

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const user = await currentUser()
  const email = user?.emailAddresses?.[0]?.emailAddress ?? ''

  const customerId = await getOrCreateStripeCustomer(userId, email)

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: PRICE_ID, quantity: 1 }],
    success_url: `${APP_URL}/?checkout=success`,
    cancel_url: `${APP_URL}/`,
  })

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
