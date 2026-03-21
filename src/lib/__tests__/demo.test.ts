// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getDemoSession,
  incrementDemoRun,
  getByokSession,
  saveByokSession,
  clearByokSession,
} from '../demo'

beforeEach(() => {
  sessionStorage.clear()
})

describe('getDemoSession', () => {
  it('returns { runsUsed: 0 } when storage is empty', () => {
    const session = getDemoSession()
    expect(session.runsUsed).toBe(0)
  })
})

describe('incrementDemoRun', () => {
  it('increments runsUsed from 0 to 1', () => {
    const session = incrementDemoRun()
    expect(session.runsUsed).toBe(1)
  })

  it('persists — getDemoSession after incrementDemoRun returns { runsUsed: 1 }', () => {
    incrementDemoRun()
    const session = getDemoSession()
    expect(session.runsUsed).toBe(1)
  })

  it('increments correctly when called twice', () => {
    incrementDemoRun()
    const session = incrementDemoRun()
    expect(session.runsUsed).toBe(2)
  })
})

describe('getByokSession', () => {
  it('returns null when storage is empty', () => {
    expect(getByokSession()).toBeNull()
  })
})

describe('saveByokSession', () => {
  it('returns { apiKey: "sk-ant-test" }', () => {
    const session = saveByokSession('sk-ant-test')
    expect(session.apiKey).toBe('sk-ant-test')
  })

  it('getByokSession returns the saved session after saveByokSession', () => {
    saveByokSession('sk-ant-test')
    const session = getByokSession()
    expect(session).not.toBeNull()
    expect(session!.apiKey).toBe('sk-ant-test')
  })
})

describe('clearByokSession', () => {
  it('removes the session — getByokSession returns null after clear', () => {
    saveByokSession('sk-ant-test')
    clearByokSession()
    expect(getByokSession()).toBeNull()
  })
})
