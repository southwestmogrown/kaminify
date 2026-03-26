import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

let _limiter: Ratelimit | null | undefined = undefined

function getLimiter(): Ratelimit | null {
  if (_limiter !== undefined) return _limiter
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    _limiter = null
    return null
  }
  _limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    prefix: 'kaminify:rl',
  })
  return _limiter
}

/**
 * Check rate limit for a given identifier. Returns { limited: false } when
 * Upstash is not configured (graceful degradation for dev/preview).
 */
export async function checkRateLimit(
  identifier: string,
): Promise<{ limited: boolean; retryAfter: number }> {
  const limiter = getLimiter()
  if (!limiter) return { limited: false, retryAfter: 0 }

  const { success, reset } = await limiter.limit(identifier)
  const retryAfter = success ? 0 : Math.ceil((reset - Date.now()) / 1000)
  return { limited: !success, retryAfter }
}

/**
 * Build the rate limit identifier from the request context.
 * Authenticated users are keyed by Clerk user ID; anonymous by IP address.
 */
export function getRateLimitId(request: Request, userId: string | null): string {
  if (userId) return `user:${userId}`
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  return `ip:${ip}`
}
