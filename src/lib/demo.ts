import type { DemoSession } from './types'

const DEMO_KEY = 'kaminify_demo_session'

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
