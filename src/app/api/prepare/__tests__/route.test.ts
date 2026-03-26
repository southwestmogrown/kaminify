import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/scraper', () => ({
  scrapeSite: vi.fn(),
}))
vi.mock('@/lib/browserScraper', () => ({
  scrapeWithBrowser: vi.fn(),
}))
vi.mock('@/lib/discover', () => ({
  discoverPages: vi.fn(),
}))
vi.mock('@/lib/extractor', () => ({
  extractDesignSystem: vi.fn(),
  extractPageContent: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: vi.fn(),
  getRateLimitId: vi.fn(),
}))

import { GET } from '../route'
import { scrapeSite } from '@/lib/scraper'
import { scrapeWithBrowser } from '@/lib/browserScraper'
import { discoverPages } from '@/lib/discover'
import { extractDesignSystem, extractPageContent } from '@/lib/extractor'
import { checkRateLimit, getRateLimitId } from '@/lib/rateLimit'
import type { ScrapedSite, DiscoveredPage, DesignSystem, PageContent } from '@/lib/types'

const mockScrapeSite = vi.mocked(scrapeSite)
const mockScrapeWithBrowser = vi.mocked(scrapeWithBrowser)
const mockDiscoverPages = vi.mocked(discoverPages)
const mockExtractDesignSystem = vi.mocked(extractDesignSystem)
const mockExtractPageContent = vi.mocked(extractPageContent)
const mockCheckRateLimit = vi.mocked(checkRateLimit)
const mockGetRateLimitId = vi.mocked(getRateLimitId)

const fakeSite: ScrapedSite = { url: 'https://example.com', html: '<html/>', css: '', title: 'Test', jsRendered: false }
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

function makeRequest(params: Record<string, string>, headers: Record<string, string> = {}) {
  const url = new URL('http://localhost:3000/api/prepare')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Request(url.toString(), { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.ANTHROPIC_API_KEY
  mockCheckRateLimit.mockResolvedValue({ limited: false, retryAfter: 0 })
  mockGetRateLimitId.mockReturnValue('ip:127.0.0.1')
})

describe('GET /api/prepare', () => {
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

  it('returns 200 with JSON body on success', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockScrapeSite.mockResolvedValue(fakeSite)
    mockDiscoverPages.mockReturnValue(fakePages)
    mockExtractDesignSystem.mockReturnValue(fakeDesign)
    mockExtractPageContent.mockReturnValue(fakeContent)

    const res = await GET(makeRequest({ designUrl: 'https://stripe.com', contentUrl: 'https://example.com' }))
    expect(res.status).toBe(200)
  })

  it('response body contains designSystem, pages, pageContents, warnings, model fields', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockScrapeSite.mockResolvedValue(fakeSite)
    mockDiscoverPages.mockReturnValue(fakePages)
    mockExtractDesignSystem.mockReturnValue(fakeDesign)
    mockExtractPageContent.mockReturnValue(fakeContent)

    const res = await GET(makeRequest({ designUrl: 'https://stripe.com', contentUrl: 'https://example.com' }))
    const body = await res.json()
    expect(body).toHaveProperty('designSystem')
    expect(body).toHaveProperty('pages')
    expect(body).toHaveProperty('pageContents')
    expect(body).toHaveProperty('warnings')
    expect(body).toHaveProperty('model')
  })

  it('pageContents length equals pages length', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const twoPages: DiscoveredPage[] = [
      { url: 'https://example.com/', title: 'Home', slug: 'index', navLabel: 'Home' },
      { url: 'https://example.com/about', title: 'About', slug: 'about', navLabel: 'About' },
    ]
    mockScrapeSite.mockResolvedValue(fakeSite)
    mockDiscoverPages.mockReturnValue(twoPages)
    mockExtractDesignSystem.mockReturnValue(fakeDesign)
    mockExtractPageContent.mockReturnValue(fakeContent)

    const res = await GET(makeRequest({ designUrl: 'https://stripe.com', contentUrl: 'https://example.com' }))
    const body = await res.json()
    expect(body.pageContents.length).toBe(2)
    expect(mockExtractPageContent).toHaveBeenCalledTimes(2)
  })

  it('uses ANTHROPIC_API_KEY env as fallback', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-key'
    mockScrapeSite.mockResolvedValue(fakeSite)
    mockDiscoverPages.mockReturnValue(fakePages)
    mockExtractDesignSystem.mockReturnValue(fakeDesign)
    mockExtractPageContent.mockReturnValue(fakeContent)

    const res = await GET(makeRequest({ designUrl: 'https://stripe.com', contentUrl: 'https://example.com' }))
    expect(res.status).toBe(200)
  })

  it('x-api-key header takes precedence over env var', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-key'
    mockScrapeSite.mockResolvedValue(fakeSite)
    mockDiscoverPages.mockReturnValue(fakePages)
    mockExtractDesignSystem.mockReturnValue(fakeDesign)
    mockExtractPageContent.mockReturnValue(fakeContent)

    const res = await GET(makeRequest(
      { designUrl: 'https://stripe.com', contentUrl: 'https://example.com' },
      { 'x-api-key': 'byok-key' }
    ))
    expect(res.status).toBe(200)
  })

  it('resolved model is claude-haiku when no byok key', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockScrapeSite.mockResolvedValue(fakeSite)
    mockDiscoverPages.mockReturnValue(fakePages)
    mockExtractDesignSystem.mockReturnValue(fakeDesign)
    mockExtractPageContent.mockReturnValue(fakeContent)

    const res = await GET(makeRequest({ designUrl: 'https://stripe.com', contentUrl: 'https://example.com' }))
    const body = await res.json()
    expect(body.model).toBe('claude-haiku-4-5-20251001')
  })

  it('resolved model is claude-sonnet-4-6 when byok key with no model param', async () => {
    mockScrapeSite.mockResolvedValue(fakeSite)
    mockDiscoverPages.mockReturnValue(fakePages)
    mockExtractDesignSystem.mockReturnValue(fakeDesign)
    mockExtractPageContent.mockReturnValue(fakeContent)

    const res = await GET(makeRequest(
      { designUrl: 'https://stripe.com', contentUrl: 'https://example.com' },
      { 'x-api-key': 'byok-key' }
    ))
    const body = await res.json()
    expect(body.model).toBe('claude-sonnet-4-6')
  })

  it('resolved model is requested model when byok key and valid model param', async () => {
    mockScrapeSite.mockResolvedValue(fakeSite)
    mockDiscoverPages.mockReturnValue(fakePages)
    mockExtractDesignSystem.mockReturnValue(fakeDesign)
    mockExtractPageContent.mockReturnValue(fakeContent)

    const res = await GET(makeRequest(
      { designUrl: 'https://stripe.com', contentUrl: 'https://example.com', model: 'claude-opus-4-6' },
      { 'x-api-key': 'byok-key' }
    ))
    const body = await res.json()
    expect(body.model).toBe('claude-opus-4-6')
  })

  it('warnings contains jsRendered message when design site is jsRendered', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const jsRenderedSite: ScrapedSite = { ...fakeSite, jsRendered: true }
    mockScrapeSite.mockResolvedValueOnce(jsRenderedSite).mockResolvedValueOnce(fakeSite)
    mockScrapeWithBrowser.mockResolvedValue(fakeSite)
    mockDiscoverPages.mockReturnValue(fakePages)
    mockExtractDesignSystem.mockReturnValue(fakeDesign)
    mockExtractPageContent.mockReturnValue(fakeContent)

    const res = await GET(makeRequest({ designUrl: 'https://stripe.com', contentUrl: 'https://example.com' }))
    const body = await res.json()
    const match = body.warnings.some((w: string) => /Detected JS rendering on design site/.test(w))
    expect(match).toBe(true)
    expect(mockScrapeWithBrowser).toHaveBeenCalled()
  })

  it('returns 500 when scrapeSite throws', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockScrapeSite.mockRejectedValue(new Error('Network failure'))

    const res = await GET(makeRequest({ designUrl: 'https://stripe.com', contentUrl: 'https://example.com' }))
    expect(res.status).toBe(500)
  })

  it('returns 429 when rate limiter rejects the request', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockCheckRateLimit.mockResolvedValue({ limited: true, retryAfter: 30 })

    const res = await GET(makeRequest({ designUrl: 'https://stripe.com', contentUrl: 'https://example.com' }))
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toMatch(/Too many requests/)
    expect(res.headers.get('Retry-After')).toBe('30')
  })

  it('passes through when rate limiter allows the request', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockCheckRateLimit.mockResolvedValue({ limited: false, retryAfter: 0 })
    mockScrapeSite.mockResolvedValue(fakeSite)
    mockDiscoverPages.mockReturnValue(fakePages)
    mockExtractDesignSystem.mockReturnValue(fakeDesign)
    mockExtractPageContent.mockReturnValue(fakeContent)

    const res = await GET(makeRequest({ designUrl: 'https://stripe.com', contentUrl: 'https://example.com' }))
    expect(res.status).toBe(200)
  })
})
