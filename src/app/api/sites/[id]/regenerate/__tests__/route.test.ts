import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/site-storage', () => ({
  getSite: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  adminClient: vi.fn(),
}))

vi.mock('@/lib/api-key-crypto', () => ({
  deserialiseEncryptedKey: vi.fn(),
  decryptApiKey: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}))

import { POST } from '../route'
import { getSite } from '@/lib/site-storage'
import { adminClient } from '@/lib/supabase'
import { deserialiseEncryptedKey, decryptApiKey } from '@/lib/api-key-crypto'
import { auth } from '@clerk/nextjs/server'

const mockAuth = vi.mocked(auth)
const mockGetSite = vi.mocked(getSite)
const mockAdminClient = vi.mocked(adminClient)
const mockDeserialiseEncryptedKey = vi.mocked(deserialiseEncryptedKey)
const mockDecryptApiKey = vi.mocked(decryptApiKey)

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
  delete process.env.ANTHROPIC_API_KEY
  mockAuth.mockResolvedValue({ userId: null } as any)
  mockAdminClient.mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  } as unknown as ReturnType<typeof adminClient>)
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

  it('returns 401 when no API key available (signed-in user with no key, no BYOK header, no env key)', async () => {
    mockAuth.mockResolvedValue({ userId: 'user-1' } as any)
    mockGetSite.mockResolvedValue(fakeSite)
    const res = await callRoute('site-1', { Authorization: 'Bearer user-token' })
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('No API key available')
  })

  it('returns 200 with stored URLs when server env key is available', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-server-key'
    mockGetSite.mockResolvedValue(fakeSite)
    const res = await callRoute('site-1', { 'x-session-id': 'session-1' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.siteId).toBe('site-1')
    expect(json.designUrl).toBe('https://stripe.com')
    expect(json.contentUrl).toBe('https://tailwindcss.com')
    expect(json.model).toBe('claude-sonnet-4-6')
  })

  it('returns 200 with stored URLs when BYOK header is provided', async () => {
    mockGetSite.mockResolvedValue(fakeSite)
    const res = await callRoute('site-1', {
      'x-session-id': 'session-1',
      'x-api-key': 'sk-ant-user-key',
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.designUrl).toBe('https://stripe.com')
    expect(json.contentUrl).toBe('https://tailwindcss.com')
  })

  it('returns 200 when signed-in user has stored encrypted API key', async () => {
    process.env.ANTHROPIC_API_KEY = ''
    mockAuth.mockResolvedValue({ userId: 'user-1' } as any)
    mockGetSite.mockResolvedValue(fakeSite)
    mockDeserialiseEncryptedKey.mockReturnValue({ ciphertext: 'abc', iv: 'def', authTag: 'ghi' })
    mockDecryptApiKey.mockReturnValue('sk-ant-decrypted-key')
    mockAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { api_key: '{"ciphertext":"abc","iv":"def","authTag":"ghi"}' },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof adminClient>)
    const res = await callRoute('site-1', { Authorization: 'Bearer user-token' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.siteId).toBe('site-1')
    expect(mockDeserialiseEncryptedKey).toHaveBeenCalled()
    expect(mockDecryptApiKey).toHaveBeenCalled()
  })

  it('returns 200 and uses env key when stored key decrypt fails', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-server-key'
    mockAuth.mockResolvedValue({ userId: 'user-1' } as any)
    mockGetSite.mockResolvedValue(fakeSite)
    mockDeserialiseEncryptedKey.mockReturnValue({ ciphertext: 'abc', iv: 'def', authTag: 'ghi' })
    mockDecryptApiKey.mockImplementation(() => { throw new Error('decrypt failed') })
    mockAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { api_key: '{"ciphertext":"abc","iv":"def","authTag":"ghi"}' },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof adminClient>)
    const res = await callRoute('site-1', { Authorization: 'Bearer user-token' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.siteId).toBe('site-1')
  })

  it('returns 500 when getSite throws', async () => {
    mockGetSite.mockRejectedValue(new Error('DB error'))
    const res = await callRoute('site-1', { 'x-session-id': 'session-1' })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('DB error')
  })
})
