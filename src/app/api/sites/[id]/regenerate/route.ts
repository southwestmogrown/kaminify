import { auth } from '@clerk/nextjs/server'
import { getSite } from '@/lib/site-storage'
import { adminClient } from '@/lib/supabase'
import { deserialiseEncryptedKey, decryptApiKey } from '@/lib/api-key-crypto'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { userId } = await auth()
  const sessionId = request.headers.get('x-session-id')
  const { id } = await params

  if (!userId && !sessionId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const site = await getSite(id, userId ?? null, sessionId ?? null)
    if (!site) {
      return new Response(JSON.stringify({ error: 'Site not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Resolve API key for this user
    let effectiveApiKey = process.env.ANTHROPIC_API_KEY ?? ''
    if (userId) {
      const { data: user } = await adminClient()
        .from('users')
        .select('api_key')
        .eq('clerk_user_id', userId)
        .single()
      if (user?.api_key) {
        try {
          const encrypted = deserialiseEncryptedKey(user.api_key)
          effectiveApiKey = decryptApiKey(encrypted)
        } catch {
          // Decrypt failed — fall through to env key
        }
      }
    }

    const byokKey = request.headers.get('x-api-key')
    if (byokKey) effectiveApiKey = byokKey

    if (!effectiveApiKey) {
      return new Response(JSON.stringify({ error: 'No API key available' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      siteId: site.id,
      designUrl: site.design_url,
      contentUrl: site.content_url,
      model: site.model,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
