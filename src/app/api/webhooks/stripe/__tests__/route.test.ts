import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
  syncSubscriptionToDb: vi.fn(),
}))

import { POST } from '../route'
import { stripe, syncSubscriptionToDb } from '@/lib/stripe'

const mockConstructEvent = vi.mocked(stripe.webhooks.constructEvent)
const mockSync = vi.mocked(syncSubscriptionToDb)

function makeRequest(body = '{}', signature = 'valid-sig') {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body,
    headers: { 'stripe-signature': signature },
  })
}

function makeSubEvent(
  type: string,
  status: string,
  customerId = 'cus_123',
  subscriptionId = 'sub_456',
): Stripe.Event {
  return {
    type,
    data: {
      object: {
        id: subscriptionId,
        status,
        customer: customerId,
      } as unknown as Stripe.Subscription,
    },
  } as unknown as Stripe.Event
}

function makeInvoiceEvent(customerId = 'cus_123'): Stripe.Event {
  return {
    type: 'invoice.payment_failed',
    data: {
      object: {
        customer: customerId,
      } as unknown as Stripe.Invoice,
    },
  } as unknown as Stripe.Event
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
})

// --- Signature verification ---------------------------------------------------

describe('POST /api/webhooks/stripe — signature verification', () => {
  it('returns 400 when signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature')
    })

    const res = await POST(makeRequest())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('signature verification failed')
  })
})

// --- customer.subscription.created ------------------------------------------

describe('POST /api/webhooks/stripe — customer.subscription.created', () => {
  it('calls syncSubscriptionToDb with pro when status is active', async () => {
    const event = makeSubEvent('customer.subscription.created', 'active')
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockSync).toHaveBeenCalledWith('cus_123', 'pro', 'sub_456')
  })

  it('calls syncSubscriptionToDb with free when status is not active', async () => {
    const event = makeSubEvent('customer.subscription.created', 'past_due')
    mockConstructEvent.mockReturnValue(event)

    await POST(makeRequest())
    expect(mockSync).toHaveBeenCalledWith('cus_123', 'free', 'sub_456')
  })
})

// --- customer.subscription.updated ------------------------------------------

describe('POST /api/webhooks/stripe — customer.subscription.updated', () => {
  it('upgrades to pro when subscription becomes active', async () => {
    const event = makeSubEvent('customer.subscription.updated', 'active')
    mockConstructEvent.mockReturnValue(event)

    await POST(makeRequest())
    expect(mockSync).toHaveBeenCalledWith('cus_123', 'pro', 'sub_456')
  })

  it('downgrades to free when subscription is cancelled', async () => {
    const event = makeSubEvent('customer.subscription.updated', 'canceled')
    mockConstructEvent.mockReturnValue(event)

    await POST(makeRequest())
    expect(mockSync).toHaveBeenCalledWith('cus_123', 'free', 'sub_456')
  })
})

// --- customer.subscription.deleted ------------------------------------------

describe('POST /api/webhooks/stripe — customer.subscription.deleted', () => {
  it('calls syncSubscriptionToDb with free and null subscription ID', async () => {
    const event = makeSubEvent('customer.subscription.deleted', 'canceled')
    mockConstructEvent.mockReturnValue(event)

    await POST(makeRequest())
    expect(mockSync).toHaveBeenCalledWith('cus_123', 'free', null)
  })
})

// --- invoice.payment_failed --------------------------------------------------

describe('POST /api/webhooks/stripe — invoice.payment_failed', () => {
  it('downgrades user to free on payment failure', async () => {
    const event = makeInvoiceEvent('cus_789')
    mockConstructEvent.mockReturnValue(event)

    await POST(makeRequest())
    expect(mockSync).toHaveBeenCalledWith('cus_789', 'free', null)
  })
})

// --- Unknown event types -----------------------------------------------------

describe('POST /api/webhooks/stripe — unknown event type', () => {
  it('returns 200 without calling syncSubscriptionToDb', async () => {
    const event = { type: 'payment_intent.succeeded', data: { object: {} } } as unknown as Stripe.Event
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockSync).not.toHaveBeenCalled()
  })
})
