import { auth } from '@clerk/nextjs/server'
import { getSite } from '@/lib/site-storage'
import { adminClient } from '@/lib/supabase'

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

    // Get the user's API key
    let effectiveApiKey = process.env.ANTHROPIC_API_KEY ?? ''
    if (userId) {
      const { data: user } = await adminClient()
        .from('users')
        .select('api_key')
        .eq('clerk_user_id', userId)
        .single()
      if (user?.api_key) {
        effectiveApiKey = user.api_key
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

    // TODO: This is a stub. Full implementation would re-run the full prepare+compose pipeline.
    // For now, return the site's stored URLs so the client can re-initiate.
    // A proper implementation would:
    // 1. Re-scrape both URLs
    // 2. Re-extract design system and page content
    // 3. Create a new run
    // 4. Stream SSE page_complete events back to client
    return new Response(JSON.stringify({
      message: 'Regenerate not yet implemented — please re-run from the home page with the same URLs',
      designUrl: site.design_url,
      contentUrl: site.content_url,
      model: site.model,
    }), {
      status: 501,
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
