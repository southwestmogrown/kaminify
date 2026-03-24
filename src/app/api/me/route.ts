import { auth } from '@clerk/nextjs/server'
import { getQuotaStatus } from '@/lib/quota'
import { adminClient } from '@/lib/supabase'

export async function GET(): Promise<Response> {
  const { userId } = await auth()

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const [quota, { data: user }] = await Promise.all([
    getQuotaStatus(userId),
    adminClient()
      .from('users')
      .select('api_key')
      .eq('clerk_user_id', userId)
      .single(),
  ])

  return new Response(
    JSON.stringify({
      runsUsed: quota.runsUsed,
      runsLimit: quota.runsLimit,
      canRun: quota.canRun,
      tier: quota.tier,
      hasApiKey: !!(user?.api_key),
      apiKey: user?.api_key ?? null,   // actual key value for session re-hydration
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}
