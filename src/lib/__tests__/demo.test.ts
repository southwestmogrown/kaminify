// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { getDemoSession, incrementDemoRun } from '../demo'

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
