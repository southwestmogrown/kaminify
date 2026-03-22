import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/scraper', () => ({
  scrapeSite: vi.fn(),
}))
vi.mock('@/lib/discover', () => ({
  discoverPages: vi.fn(),
}))
vi.mock('@/lib/extractor', () => ({
  extractDesignSystem: vi.fn(),
  extractPageContent: vi.fn(),
}))
vi.mock('@/lib/composer', () => ({
  composePage: vi.fn(),
}))

import { GET } from '../route'
import { scrapeSite } from '@/lib/scraper'
import { discoverPages } from '@/lib/discover'
import { extractDesignSystem, extractPageContent } from '@/lib/extractor'
import { composePage } from '@/lib/composer'
import type { ScrapedSite, DiscoveredPage, DesignSystem, PageContent } from '@/lib/types'

const mockScrapeSite = vi.mocked(scrapeSite)
const mockDiscoverPages = vi.mocked(discoverPages)
const mockExtractDesignSystem = vi.mocked(extractDesignSystem)
const mockExtractPageContent = vi.mocked(extractPageContent)
const mockComposePage = vi.mocked(composePage)

const fakeSite: ScrapedSite = { url: 'https://example.com', html: '<html/>', css: '', scripts: '', title: 'Test' }
const fakePages: DiscoveredPage[] = [
  { url: 'https://example.com/', title: 'Home', slug: 'index', navLabel: 'Home' },
]
const fakeDesign: DesignSystem = {
  cssVariables: '',
  colorPalette: [], fontStack: [], spacing: [], borderRadius: [],
  componentPatterns: { nav: '', hero: '', footer: '', card: '', button: '' },
  sections: [],
  interactivityPatterns: '',
  rawCss: '',
}
const fakeContent: PageContent = {
  url: 'https://example.com/', title: 'Home', slug: 'index',
  headings: [], paragraphs: [], listItems: [], ctaTexts: [], imageAlts: [], metaDescription: '',
}
const fakeHtml = '<!DOCTYPE html><html><body>Hello</body></html>'

function makeRequest(params: Record<string, string>, headers: Record<string, string> = {}) {
  const url = new URL('http://localhost:3000/api/clone')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Request(url.toString(), { headers })
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

describe('GET /api/clone', () => {
  it('returns 400 when designUrl is missing', async () => {
    const res = await GET(makeRequest({ contentUrl: 'https://example.com' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when contentUrl is missing', async () => {
    const res = await GET(makeRequest({ designUrl: 'https://stripe.com' }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when no API key is available', async () => {
    const res = await GET(makeRequest({ designUrl: 'https://stripe.com', contentUrl: 'https://example.com' }))
    expect(res.status).toBe(401)
  })

  it('uses x-api-key header when provided', async () => {
    mockScrapeSite.mockResolvedValue(fakeSite)
    mockDiscoverPages.mockReturnValue(fakePages)
    mockExtractDesignSystem.mockReturnValue(fakeDesign)
    mockExtractPageContent.mockReturnValue(fakeContent)
    mockComposePage.mockResolvedValue(fakeHtml)

    const res = await GET(makeRequest(
      { designUrl: 'https://stripe.com', contentUrl: 'https://example.com' },
      { 'x-api-key': 'byok-key' }
    ))
    expect(res.status).toBe(200)
    await collectStream(res)
    expect(mockComposePage).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), 'byok-key'
    )
  })

  it('uses env ANTHROPIC_API_KEY as fallback', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-key'
    mockScrapeSite.mockResolvedValue(fakeSite)
    mockDiscoverPages.mockReturnValue(fakePages)
    mockExtractDesignSystem.mockReturnValue(fakeDesign)
    mockExtractPageContent.mockReturnValue(fakeContent)
    mockComposePage.mockResolvedValue(fakeHtml)

    const res = await GET(makeRequest({ designUrl: 'https://stripe.com', contentUrl: 'https://example.com' }))
    expect(res.status).toBe(200)
    await collectStream(res)
    expect(mockComposePage).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), 'env-key'
    )
  })

  it('x-api-key header takes precedence over env var', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-key'
    mockScrapeSite.mockResolvedValue(fakeSite)
    mockDiscoverPages.mockReturnValue(fakePages)
    mockExtractDesignSystem.mockReturnValue(fakeDesign)
    mockExtractPageContent.mockReturnValue(fakeContent)
    mockComposePage.mockResolvedValue(fakeHtml)

    const res = await GET(makeRequest(
      { designUrl: 'https://stripe.com', contentUrl: 'https://example.com' },
      { 'x-api-key': 'byok-key' }
    ))
    await collectStream(res)
    expect(mockComposePage).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), 'byok-key'
    )
  })

  it('streams status, page_complete, and done events on success', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockScrapeSite.mockResolvedValue(fakeSite)
    mockDiscoverPages.mockReturnValue(fakePages)
    mockExtractDesignSystem.mockReturnValue(fakeDesign)
    mockExtractPageContent.mockReturnValue(fakeContent)
    mockComposePage.mockResolvedValue(fakeHtml)

    const res = await GET(makeRequest({ designUrl: 'https://stripe.com', contentUrl: 'https://example.com' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')

    const raw = await collectStream(res)
    const events = parseEvents(raw)
    const types = events.map((e: { type: string }) => e.type)

    expect(types).toContain('status')
    expect(types).toContain('page_complete')
    expect(types[types.length - 1]).toBe('done')
  })

  it('streams an error event when scrapeSite throws', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockScrapeSite.mockRejectedValue(new Error('Network failure'))

    const res = await GET(makeRequest({ designUrl: 'https://stripe.com', contentUrl: 'https://example.com' }))
    const raw = await collectStream(res)
    const events = parseEvents(raw)
    const errorEvent = events.find((e: { type: string }) => e.type === 'error')

    expect(errorEvent).toBeDefined()
    expect(errorEvent.error).toMatch(/Network failure/)
  })
})
