import { describe, it, expect } from 'vitest'
import { config } from '@/middleware'

describe('middleware config', () => {
  const matchers = config.matcher

  it('exports a matcher array with two patterns', () => {
    expect(Array.isArray(matchers)).toBe(true)
    expect(matchers.length).toBe(2)
  })

  it('first matcher excludes static asset extensions', () => {
    const pattern = matchers[0]
    // The pattern should skip static files: .html, .css, .js, .ico, .png, etc.
    expect(pattern).toContain('_next')
    expect(pattern).toContain('css')
    expect(pattern).toContain('ico')
    expect(pattern).toContain('png')
    expect(pattern).toContain('svg')
  })

  it('second matcher covers /api and /trpc routes', () => {
    const pattern = matchers[1]
    expect(pattern).toContain('api')
    expect(pattern).toContain('trpc')
  })
})
