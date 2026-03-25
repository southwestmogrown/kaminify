import { auth } from '@clerk/nextjs/server'
import { listSites } from '@/lib/site-storage'

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth()
  const sessionId = request.headers.get('x-session-id')

  try {
    const sites = await listSites(userId ?? null, sessionId ?? null)
    return new Response(JSON.stringify({ sites }), {
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
