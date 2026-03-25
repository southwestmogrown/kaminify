import { auth } from '@clerk/nextjs/server'
import { getQuotaStatus } from '@/lib/quota'
import { adminClient } from '@/lib/supabase'
import { deserialiseEncryptedKey, decryptApiKey } from '@/lib/api-key-crypto'

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

  // Decrypt the stored API key to return the plaintext to the client
  let apiKey: string | null = null
  if (user?.api_key) {
    try {
      const encrypted = deserialiseEncryptedKey(user.api_key)
      apiKey = decryptApiKey(encrypted)
    } catch {
      // Encryption key was rotated or DB record is corrupt — treat as no key
      apiKey = null
    }
  }

  return new Response(
    JSON.stringify({
      runsUsed: quota.runsUsed,
      runsLimit: quota.runsLimit,
      canRun: quota.canRun,
      tier: quota.tier,
      hasApiKey: !!apiKey,
      apiKey,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}
