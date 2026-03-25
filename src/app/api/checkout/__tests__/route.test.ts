import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}))

vi.mock('@/lib/stripe', () => ({
  getOrCreateStripeCustomer: vi.fn(),
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  },
  PRICE_ID: 'price_test_123',
}))

import { POST } from '../route'
import { auth, currentUser } from '@clerk/nextjs/server'
import { getOrCreateStripeCustomer, stripe } from '@/lib/stripe'

const mockAuth = vi.mocked(auth)
const mockCurrentUser = vi.mocked(currentUser)
const mockGetOrCreateCustomer = vi.mocked(getOrCreateStripeCustomer)
const mockSessionCreate = vi.mocked(stripe.checkout.sessions.create)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/checkout', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)

    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns checkout session URL for authenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_abc' } as never)
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'test@example.com' }],
    } as never)
    mockGetOrCreateCustomer.mockResolvedValue('cus_123')
    mockSessionCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_test' } as never)

    const res = await POST()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://checkout.stripe.com/pay/cs_test')
  })

  it('creates Stripe customer and session with correct params', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_abc' } as never)
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'test@example.com' }],
    } as never)
    mockGetOrCreateCustomer.mockResolvedValue('cus_123')
    mockSessionCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_test' } as never)

    await POST()

    expect(mockGetOrCreateCustomer).toHaveBeenCalledWith('user_abc', 'test@example.com')
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        mode: 'subscription',
        line_items: [{ price: 'price_test_123', quantity: 1 }],
      }),
    )
  })
})
