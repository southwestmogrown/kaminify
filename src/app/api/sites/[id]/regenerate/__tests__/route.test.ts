import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/site-storage', () => ({
  getSite: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}))

import { POST } from '../route'
import { getSite } from '@/lib/site-storage'
import { auth } from '@clerk/nextjs/server'

const mockAuth = vi.mocked(auth)
const mockGetSite = vi.mocked(getSite)

const fakeSite = {
  id: 'site-1',
  user_id: 'user-1',
  session_id: null,
  name: 'Test Site',
  design_url: 'https://stripe.com',
  content_url: 'https://tailwindcss.com',
  model: 'claude-sonnet-4-6',
  page_count: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
}

async function callRoute(siteId: string, headers: Record<string, string> = {}) {
  const req = new Request(`http://localhost:3000/api/sites/${siteId}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
  })
  return POST(req as Request, { params: Promise.resolve({ id: siteId }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAuth.mockImplementation(() => Promise.resolve({ userId: null } as any) as any)
})

describe('POST /api/sites/:id/regenerate', () => {
  it('returns 401 when no auth and no sessionId', async () => {
    const res = await callRoute('site-1')
    expect(res.status).toBe(401)
  })

  it('returns 404 when site not found', async () => {
    mockGetSite.mockResolvedValue(null)
    const res = await callRoute('nonexistent', { 'x-session-id': 'session-1' })
    expect(res.status).toBe(404)
  })

  it('returns 200 with stored site metadata for session user', async () => {
    mockGetSite.mockResolvedValue(fakeSite)
    const res = await callRoute('site-1', { 'x-session-id': 'session-1' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.siteId).toBe('site-1')
    expect(json.designUrl).toBe('https://stripe.com')
    expect(json.contentUrl).toBe('https://tailwindcss.com')
    expect(json.model).toBe('claude-sonnet-4-6')
  })

  it('returns 200 with stored site metadata for signed-in user', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockImplementation(() => Promise.resolve({ userId: 'user-1' }) as any)
    mockGetSite.mockResolvedValue(fakeSite)
    const res = await callRoute('site-1', { Authorization: 'Bearer user-token' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.siteId).toBe('site-1')
    expect(json.designUrl).toBe('https://stripe.com')
    expect(json.contentUrl).toBe('https://tailwindcss.com')
    expect(json.model).toBe('claude-sonnet-4-6')
  })

  it('returns 500 when getSite throws', async () => {
    mockGetSite.mockRejectedValue(new Error('DB error'))
    const res = await callRoute('site-1', { 'x-session-id': 'session-1' })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('DB error')
  })
})
