import Stripe from 'stripe'
import { adminClient } from './supabase'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion,
})

export const PRICE_ID = process.env.STRIPE_PRICE_ID!

/**
 * Look up the Stripe customer ID for a user, creating a new Stripe customer if
 * one doesn't exist yet. Persists the customer ID back to the users table.
 */
export async function getOrCreateStripeCustomer(
  clerkUserId: string,
  email: string,
): Promise<string> {
  const db = adminClient()

  const { data: user } = await db
    .from('users')
    .select('stripe_customer_id')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (user?.stripe_customer_id) {
    return user.stripe_customer_id
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { clerkUserId },
  })

  await db
    .from('users')
    .update({ stripe_customer_id: customer.id })
    .eq('clerk_user_id', clerkUserId)

  return customer.id
}

/**
 * Update the users table with the latest subscription state. Called from the
 * Stripe webhook handler whenever a subscription event arrives. Looks up the
 * user by their Stripe customer ID.
 */
export async function syncSubscriptionToDb(
  stripeCustomerId: string,
  status: 'free' | 'pro',
  stripeSubscriptionId: string | null,
): Promise<void> {
  await adminClient()
    .from('users')
    .update({
      subscription_status: status,
      stripe_subscription_id: stripeSubscriptionId,
    })
    .eq('stripe_customer_id', stripeCustomerId)
}
