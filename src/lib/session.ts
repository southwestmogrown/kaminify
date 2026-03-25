/**
 * session.ts
 *
 * Client-side only. Manages the anonymous session ID in sessionStorage.
 * This ID is used to track anonymous users' runs so they can be
 * claimed by their account after sign-in.
 */

const SESSION_KEY = 'kaminify_session_id'

export function isServer(): boolean {
  return typeof window === 'undefined'
}

/** Get the current session ID, creating one if it doesn't exist. */
export function getOrCreateSessionId(): string {
  if (isServer()) return ''
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const newId = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, newId)
    return newId
  } catch {
    // sessionStorage not available (e.g., private browsing in some contexts)
    return ''
  }
}

/** Get the session ID without creating one if missing. */
export function getSessionId(): string | null {
  if (isServer()) return null
  try {
    return sessionStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

/** Clear the session ID (used after claiming). */
export function clearSessionId(): void {
  if (isServer()) return
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}
