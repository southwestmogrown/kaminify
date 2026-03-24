import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS. Server-only. Never expose to browser.
export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
