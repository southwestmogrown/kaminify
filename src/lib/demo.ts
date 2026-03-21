import type { DemoSession, ByokSession } from './types'

const DEMO_KEY = 'kaminify_demo_session'
const BYOK_KEY = 'kaminify_byok_session'

function isServer(): boolean {
  return typeof window === 'undefined'
}

function defaultDemoSession(): DemoSession {
  return { runsUsed: 0, startedAt: new Date().toISOString() }
}

export function getDemoSession(): DemoSession {
  if (isServer()) return defaultDemoSession()
  try {
    const raw = sessionStorage.getItem(DEMO_KEY)
    if (!raw) return defaultDemoSession()
    return JSON.parse(raw) as DemoSession
  } catch {
    return defaultDemoSession()
  }
}

export function incrementDemoRun(): DemoSession {
  if (isServer()) return defaultDemoSession()
  const session = getDemoSession()
  const updated: DemoSession = {
    runsUsed: session.runsUsed + 1,
    startedAt: session.startedAt,
  }
  sessionStorage.setItem(DEMO_KEY, JSON.stringify(updated))
  return updated
}

export function getByokSession(): ByokSession | null {
  if (isServer()) return null
  try {
    const raw = sessionStorage.getItem(BYOK_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ByokSession
  } catch {
    return null
  }
}

export function saveByokSession(apiKey: string): ByokSession {
  const session: ByokSession = { apiKey, addedAt: new Date().toISOString() }
  if (!isServer()) {
    sessionStorage.setItem(BYOK_KEY, JSON.stringify(session))
  }
  return session
}

export function clearByokSession(): void {
  if (isServer()) return
  sessionStorage.removeItem(BYOK_KEY)
}
