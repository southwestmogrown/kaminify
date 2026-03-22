import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/composer', () => ({
  composePage: vi.fn(),
}))

import { POST } from '../route'
import { composePage } from '@/lib/composer'
import type { ScrapedSite, DiscoveredPage, DesignSystem, PageContent } from '@/lib/types'

const mockComposePage = vi.mocked(composePage)

const fakeSite: ScrapedSite = { url: 'https://example.com', html: '<html/>', css: '', title: 'Test', jsRendered: false }
void fakeSite // used as reference fixture only

const fakePages: DiscoveredPage[] = [
  { url: 'https://example.com/', title: 'Home', slug: 'index', navLabel: 'Home' },
]
const fakeDesign: DesignSystem = {
  cssVariables: '',
  colorPalette: [], fontStack: [], spacing: [], borderRadius: [],
  componentPatterns: { nav: '', hero: '', footer: '', card: '', button: '' },
  rawCss: '',
}
const fakeContent: PageContent = {
  url: 'https://example.com/', title: 'Home', slug: 'index',
  headings: [], paragraphs: [], listItems: [], ctaTexts: [], imageAlts: [], metaDescription: '',
}
const fakeHtml = '<!DOCTYPE html><html><body>Hello</body></html>'

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/compose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

async function collectStream(response: Response): Promise<string> {
  const text = await response.text()
  return text
}

function parseEvents(raw: string) {
  return raw
    .split('\n\n')
    .filter(Boolean)
    .map((line) => {
      const data = line.replace(/^data: /, '')
      try { return JSON.parse(data) } catch { return null }
    })
    .filter(Boolean)
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.ANTHROPIC_API_KEY
})

describe('POST /api/compose', () => {
  it('returns 401 when no API key is available', async () => {
    const res = await POST(makeRequest({ designSystem: fakeDesign, pageContent: fakeContent, allPages: fakePages }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when body is malformed JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const res = await POST(new Request('http://localhost:3000/api/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when designSystem is missing from body', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const res = await POST(makeRequest({ pageContent: fakeContent, allPages: fakePages }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when pageContent is missing from body', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const res = await POST(makeRequest({ designSystem: fakeDesign, allPages: fakePages }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when allPages is not an array', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const res = await POST(makeRequest({ designSystem: fakeDesign, pageContent: fakeContent, allPages: 'not-array' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with Content-Type text/event-stream on valid request', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockComposePage.mockResolvedValue(fakeHtml)

    const res = await POST(makeRequest({ designSystem: fakeDesign, pageContent: fakeContent, allPages: fakePages, model: 'claude-haiku-4-5-20251001' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    await collectStream(res)
  })

  it('streams status event containing navLabel', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockComposePage.mockResolvedValue(fakeHtml)

    const res = await POST(makeRequest({ designSystem: fakeDesign, pageContent: fakeContent, allPages: fakePages, model: 'claude-haiku-4-5-20251001' }))
    const raw = await collectStream(res)
    const events = parseEvents(raw)
    const statusEvent = events.find((e: { type: string }) => e.type === 'status')

    expect(statusEvent).toBeDefined()
    expect(statusEvent.message).toContain('Home')
  })

  it('streams page_complete event with correct fields', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockComposePage.mockResolvedValue(fakeHtml)

    const res = await POST(makeRequest({ designSystem: fakeDesign, pageContent: fakeContent, allPages: fakePages, model: 'claude-haiku-4-5-20251001' }))
    const raw = await collectStream(res)
    const events = parseEvents(raw)
    const pageCompleteEvent = events.find((e: { type: string }) => e.type === 'page_complete')

    expect(pageCompleteEvent).toBeDefined()
    expect(pageCompleteEvent.page.slug).toBe(fakeContent.slug)
    expect(pageCompleteEvent.page.title).toBe(fakeContent.title)
    expect(pageCompleteEvent.page.navLabel).toBe('Home')
    expect(pageCompleteEvent.page.html).toBe(fakeHtml)
    expect(pageCompleteEvent.page.generatedAt).toBeDefined()
  })

  it('falls back to slug for navLabel when title is empty and no allPages match', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockComposePage.mockResolvedValue(fakeHtml)

    const emptyTitleContent: PageContent = { ...fakeContent, title: '', slug: 'about' }
    const res = await POST(makeRequest({ designSystem: fakeDesign, pageContent: emptyTitleContent, allPages: [], model: 'claude-haiku-4-5-20251001' }))
    const raw = await collectStream(res)
    const events = parseEvents(raw)
    const statusEvent = events.find((e: { type: string }) => e.type === 'status')

    expect(statusEvent).toBeDefined()
    expect(statusEvent.message).toContain('about')
    expect(statusEvent.message).not.toContain('undefined')
  })

  it('does not stream a done event', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockComposePage.mockResolvedValue(fakeHtml)

    const res = await POST(makeRequest({ designSystem: fakeDesign, pageContent: fakeContent, allPages: fakePages, model: 'claude-haiku-4-5-20251001' }))
    const raw = await collectStream(res)
    const events = parseEvents(raw)

    expect(events.find((e: { type: string }) => e.type === 'done')).toBeUndefined()
  })

  it('streams error event when composePage throws', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockComposePage.mockRejectedValue(new Error('Claude error'))

    const res = await POST(makeRequest({ designSystem: fakeDesign, pageContent: fakeContent, allPages: fakePages, model: 'claude-haiku-4-5-20251001' }))
    const raw = await collectStream(res)
    const events = parseEvents(raw)
    const errorEvent = events.find((e: { type: string }) => e.type === 'error')

    expect(errorEvent).toBeDefined()
    expect(errorEvent.error).toMatch(/Claude error/)
  })

  it('calls composePage with the byok key', async () => {
    mockComposePage.mockResolvedValue(fakeHtml)

    const res = await POST(makeRequest(
      { designSystem: fakeDesign, pageContent: fakeContent, allPages: fakePages },
      { 'x-api-key': 'byok-key' }
    ))
    await collectStream(res)
    expect(mockComposePage).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), 'byok-key', expect.any(String)
    )
  })

  it('calls composePage with env key when no x-api-key header', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-key'
    mockComposePage.mockResolvedValue(fakeHtml)

    const res = await POST(makeRequest({ designSystem: fakeDesign, pageContent: fakeContent, allPages: fakePages }))
    await collectStream(res)
    expect(mockComposePage).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), 'env-key', expect.any(String)
    )
  })

  it('uses haiku model when no byok key', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-key'
    mockComposePage.mockResolvedValue(fakeHtml)

    const res = await POST(makeRequest({ designSystem: fakeDesign, pageContent: fakeContent, allPages: fakePages }))
    await collectStream(res)
    expect(mockComposePage).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.any(String), 'claude-haiku-4-5-20251001'
    )
  })

  it('uses claude-sonnet-4-6 model when byok key present and no model in body', async () => {
    mockComposePage.mockResolvedValue(fakeHtml)

    const res = await POST(makeRequest(
      { designSystem: fakeDesign, pageContent: fakeContent, allPages: fakePages },
      { 'x-api-key': 'byok-key' }
    ))
    await collectStream(res)
    expect(mockComposePage).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.any(String), 'claude-sonnet-4-6'
    )
  })
})
