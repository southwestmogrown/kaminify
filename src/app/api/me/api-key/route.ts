import { auth } from '@clerk/nextjs/server'
import { adminClient } from '@/lib/supabase'

function isValidApiKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith('sk-ant-')
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth()

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { apiKey?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { apiKey } = body

  if (!apiKey || !isValidApiKey(apiKey)) {
    return new Response(JSON.stringify({ error: 'Invalid API key format. Must start with sk-ant-.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { error } = await adminClient()
    .from('users')
    .update({ api_key: apiKey, updated_at: new Date().toISOString() })
    .eq('clerk_user_id', userId)

  if (error) {
    return new Response(JSON.stringify({ error: `Failed to save API key: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ saved: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function DELETE(): Promise<Response> {
  const { userId } = await auth()

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { error } = await adminClient()
    .from('users')
    .update({ api_key: null, updated_at: new Date().toISOString() })
    .eq('clerk_user_id', userId)

  if (error) {
    return new Response(JSON.stringify({ error: `Failed to clear API key: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ cleared: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
