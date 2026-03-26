import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLimit = vi.fn()

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    vi.fn().mockImplementation(function () {
      return { limit: mockLimit }
    }),
    {
      slidingWindow: vi.fn().mockReturnValue('sliding-window-config'),
    },
  ),
}))

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(function () {
    return {}
  }),
}))

import { checkRateLimit, getRateLimitId } from '../rateLimit'

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('checkRateLimit', () => {
  it('returns { limited: false } when Upstash env vars are not set', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const result = await checkRateLimit('user:test')
    expect(result).toEqual({ limited: false, retryAfter: 0 })
  })

  it('returns { limited: false } when limiter allows the request', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    mockLimit.mockResolvedValue({ success: true, reset: Date.now() + 60000 })

    const { checkRateLimit: freshCheck } = await import('../rateLimit')
    const result = await freshCheck('user:abc')
    expect(result.limited).toBe(false)
  })

  it('returns { limited: true } with retryAfter when limiter rejects', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    const future = Date.now() + 30000
    mockLimit.mockResolvedValue({ success: false, reset: future })

    const { checkRateLimit: freshCheck } = await import('../rateLimit')
    const result = await freshCheck('user:abc')
    expect(result.limited).toBe(true)
    expect(result.retryAfter).toBeGreaterThan(0)
  })
})

describe('getRateLimitId', () => {
  it('returns user:<id> for authenticated users', () => {
    const req = new Request('http://localhost/api/prepare')
    expect(getRateLimitId(req, 'user_abc')).toBe('user:user_abc')
  })

  it('returns ip:<ip> from x-forwarded-for for anonymous users', () => {
    const req = new Request('http://localhost/api/prepare', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(getRateLimitId(req, null)).toBe('ip:1.2.3.4')
  })

  it('returns ip:<ip> from x-real-ip when x-forwarded-for is absent', () => {
    const req = new Request('http://localhost/api/prepare', {
      headers: { 'x-real-ip': '9.10.11.12' },
    })
    expect(getRateLimitId(req, null)).toBe('ip:9.10.11.12')
  })

  it('returns ip:unknown when no IP headers are present', () => {
    const req = new Request('http://localhost/api/prepare')
    expect(getRateLimitId(req, null)).toBe('ip:unknown')
  })
})
