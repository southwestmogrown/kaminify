import { verifyToken } from '@clerk/backend'

/**
 * Clerk JWT validation for API routes.
 *
 * Reads the Authorization: Bearer <token> header, verifies the token using
 * Clerk's JWKS endpoint, and returns the Clerk user ID (sub claim).
 *
 * Does NOT require @clerk/nextjs — works in any API route via the raw Request.
 */

function getClerkPublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  if (!key) throw new Error('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set')
  return key
}

function getClerkSecretKey(): string {
  const key = process.env.CLERK_SECRET_KEY
  if (!key) throw new Error('CLERK_SECRET_KEY is not set')
  return key
}

/**
 * Returns the Clerk user ID from a verified Authorization: Bearer token.
 * Returns null if no token was provided or if verification fails.
 */
export async function getClerkUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  if (!token) return null

  try {
    const publishableKey = getClerkPublishableKey()
    const secretKey = getClerkSecretKey()

    // audience must match the frontend api URL configured in Clerk
    const audience = `${publishableKey.split('/')[0]}`

    const payload = await verifyToken(token, {
      secretKey,
      authorizedParties: [
        'http://localhost:3000',
        'https://app.kaminify.com',
        'https://*.vercel.app',
      ],
      audience,
    })

    return payload?.sub ?? null
  } catch {
    // Token invalid or expired
    return null
  }
}

/**
 * Like getClerkUserId but throws a 401 Response if the token is missing or invalid.
 * Use this when the route requires an authenticated user.
 */
export async function requireClerkUserId(request: Request): Promise<string> {
  const userId = await getClerkUserId(request)
  if (!userId) {
    throw new Response('Unauthorized', { status: 401 })
  }
  return userId
}
