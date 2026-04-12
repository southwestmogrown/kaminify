/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { getOrCreateSessionId, getSessionId, clearSessionId } from '../session'

describe('session', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  describe('getOrCreateSessionId', () => {
    it('creates a new session ID when none exists', () => {
      const id = getOrCreateSessionId()
      expect(id).toBeTruthy()
      // UUID format check
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    })

    it('returns the same session ID on subsequent calls', () => {
      const first = getOrCreateSessionId()
      const second = getOrCreateSessionId()
      expect(first).toBe(second)
    })

    it('persists the session ID in sessionStorage', () => {
      const id = getOrCreateSessionId()
      expect(sessionStorage.getItem('kaminify_session_id')).toBe(id)
    })
  })

  describe('getSessionId', () => {
    it('returns null when no session ID exists', () => {
      expect(getSessionId()).toBeNull()
    })

    it('returns the session ID when it exists', () => {
      const id = getOrCreateSessionId()
      expect(getSessionId()).toBe(id)
    })
  })

  describe('clearSessionId', () => {
    it('removes the session ID from sessionStorage', () => {
      getOrCreateSessionId()
      clearSessionId()
      expect(getSessionId()).toBeNull()
    })

    it('does not throw when no session exists', () => {
      expect(() => clearSessionId()).not.toThrow()
    })
  })
})
