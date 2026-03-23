import { adminClient } from './supabase'
import type { QuotaStatus, UserRecord } from './types'

const FREE_RUN_LIMIT = parseInt(process.env.DEMO_RUN_LIMIT ?? '3', 10)

function currentMonthStart(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
}

// Upsert user row. Resets monthly counter if we've rolled into a new month.
// Returns the up-to-date user record.
export async function getOrCreateUser(clerkUserId: string): Promise<UserRecord> {
  const db = adminClient()
  const monthStart = currentMonthStart()

  // Upsert — creates row on first call, no-op on conflict
  const { error: upsertError } = await db
    .from('users')
    .upsert({ clerk_user_id: clerkUserId }, { onConflict: 'clerk_user_id', ignoreDuplicates: true })

  if (upsertError) throw new Error(`upsert user: ${upsertError.message}`)

  // Fetch current state
  const { data, error: fetchError } = await db
    .from('users')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (fetchError || !data) throw new Error(`fetch user: ${fetchError?.message}`)

  // Reset counter if we're in a new month
  if (data.month_start < monthStart) {
    const { data: reset, error: resetError } = await db
      .from('users')
      .update({ runs_this_month: 0, month_start: monthStart })
      .eq('clerk_user_id', clerkUserId)
      .select('*')
      .single()

    if (resetError || !reset) throw new Error(`reset month: ${resetError?.message}`)
    return reset as UserRecord
  }

  return data as UserRecord
}

// Returns quota status for a signed-in user.
export async function getQuotaStatus(clerkUserId: string): Promise<QuotaStatus> {
  const user = await getOrCreateUser(clerkUserId)
  const isPro = user.subscription_status === 'pro'

  return {
    tier: isPro ? 'pro' : 'free',
    runsUsed: user.runs_this_month,
    runsLimit: isPro ? null : FREE_RUN_LIMIT,
    canRun: isPro || user.runs_this_month < FREE_RUN_LIMIT,
  }
}

// Increment run count for a signed-in user.
export async function incrementRun(clerkUserId: string): Promise<void> {
  const db = adminClient()
  const { error } = await db.rpc('increment_runs', { p_clerk_user_id: clerkUserId })
  if (error) {
    // Fallback: manual increment if RPC not available
    const user = await getOrCreateUser(clerkUserId)
    const { error: updateError } = await db
      .from('users')
      .update({ runs_this_month: user.runs_this_month + 1 })
      .eq('clerk_user_id', clerkUserId)
    if (updateError) throw new Error(`increment run: ${updateError.message}`)
  }
}
