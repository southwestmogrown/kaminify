// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { POST } from '../route'
import type { ClonedPage } from '@/lib/types'

function makeClonedPage(slug: string, html: string): ClonedPage {
  return {
    slug,
    title: `${slug} page`,
    navLabel: slug,
    html,
    generatedAt: new Date().toISOString(),
  }
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/download', () => {
  it('returns 200 with Content-Type application/zip for valid pages', async () => {
    const pages: ClonedPage[] = [
      makeClonedPage('index', '<!DOCTYPE html><html><body>Home</body></html>'),
      makeClonedPage('about', '<!DOCTYPE html><html><body>About</body></html>'),
    ]

    const res = await POST(makeRequest({ pages }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/zip')

    const buffer = await res.arrayBuffer()
    expect(buffer.byteLength).toBeGreaterThan(0)
  })

  it('returns 200 with Content-Type application/zip for empty pages array', async () => {
    const res = await POST(makeRequest({ pages: [] }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/zip')

    const buffer = await res.arrayBuffer()
    expect(buffer.byteLength).toBeGreaterThan(0)
  })

  it('returns 400 when pages key is missing from body', async () => {
    const res = await POST(makeRequest({ foo: 'bar' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when body is malformed JSON', async () => {
    const req = new Request('http://localhost:3000/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json{{{',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
