// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderSite } from '../renderer'

function makeResponse(body: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    text: () => Promise.resolve(body),
  } as unknown as Response
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('renderSite', () => {
  it('returns rendered HTML from Browserless', async () => {
    vi.stubEnv('BROWSERLESS_API_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('<html>rendered</html>')))
    const result = await renderSite('https://example.com')
    expect(result).toBe('<html>rendered</html>')
  })

  it('throws when BROWSERLESS_API_KEY is not set', async () => {
    delete process.env.BROWSERLESS_API_KEY
    await expect(renderSite('https://example.com')).rejects.toThrow('BROWSERLESS_API_KEY is not configured')
  })

  it('throws on non-200 response', async () => {
    vi.stubEnv('BROWSERLESS_API_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('', false, 429)))
    await expect(renderSite('https://example.com')).rejects.toThrow('Browserless error: 429')
  })

  it('POSTs the URL to the Browserless /content endpoint', async () => {
    vi.stubEnv('BROWSERLESS_API_KEY', 'my-key')
    const mockFetch = vi.fn().mockResolvedValue(makeResponse('<html/>'))
    vi.stubGlobal('fetch', mockFetch)
    await renderSite('https://target.com')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/content?token=my-key'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"url":"https://target.com"'),
      })
    )
  })

  it('uses BROWSERLESS_BASE_URL when set', async () => {
    vi.stubEnv('BROWSERLESS_API_KEY', 'key')
    vi.stubEnv('BROWSERLESS_BASE_URL', 'https://production-lon.browserless.io')
    const mockFetch = vi.fn().mockResolvedValue(makeResponse('<html/>'))
    vi.stubGlobal('fetch', mockFetch)
    await renderSite('https://example.com')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('production-lon.browserless.io'),
      expect.anything()
    )
  })
})
