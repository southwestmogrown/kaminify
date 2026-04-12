/**
 * Integration test: prepare → compose → download
 *
 * Mocks external services (fetch, Anthropic SDK, Clerk, Supabase) but
 * exercises the real internal wiring between the three route handlers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- Mock external modules BEFORE importing routes ---

// Mock Clerk's auth function — always returns no user (anonymous demo mode)
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: null }),
}))

// Mock the scraper module
const mockScrapeSite = vi.fn()
vi.mock('@/lib/scraper', () => ({
  scrapeSite: (...args: unknown[]) => mockScrapeSite(...args),
}))

// Mock the browser scraper (shouldn't be called in this test)
vi.mock('@/lib/browserScraper', () => ({
  scrapeWithBrowser: vi.fn(),
}))

// Mock the Anthropic SDK
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  function MockAnthropic() {
    return { messages: { create: mockCreate } }
  }
  return { default: MockAnthropic }
})

// Import the route handlers
import { GET as prepareGET } from '@/app/api/prepare/route'
import { POST as composePOST } from '@/app/api/compose/route'
import { POST as downloadPOST } from '@/app/api/download/route'
import type { ClonedPage, DesignSystem, PageContent } from '@/lib/types'

// --- Fixtures ---

const DESIGN_HTML = `
<html>
  <head>
    <title>Design Site</title>
    <style>
      :root { --primary: #f97316; }
      body { font-family: "Inter", sans-serif; color: #333; }
      nav { display: flex; gap: 1rem; }
    </style>
  </head>
  <body>
    <nav><a href="/">Home</a><a href="/about">About</a></nav>
    <footer>© 2026</footer>
  </body>
</html>
`

const CONTENT_HTML = `
<html>
  <head>
    <title>Content Site</title>
    <meta name="description" content="A great content site." />
  </head>
  <body>
    <nav><a href="/">Home</a><a href="/about">About</a></nav>
    <h1>Welcome to Content Site</h1>
    <p>This is a paragraph with enough text to pass the minimum length filter.</p>
    <img src="hero.jpg" alt="Hero image" />
  </body>
</html>
`

const VALID_HTML = '<!DOCTYPE html><html><head><title>Cloned</title></head><body><h1>Hello</h1></body></html>'

// --- Helpers ---

function makeRequest(path: string, options: RequestInit & { params?: Record<string, string> } = {}) {
  const url = new URL(`http://localhost:3000${path}`)
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) url.searchParams.set(k, v)
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { params: _, ...rest } = options
  return new Request(url.toString(), rest)
}

async function readSSEEvents(response: Response) {
  const text = await response.text()
  const events: unknown[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('data: ')) {
      try {
        events.push(JSON.parse(trimmed.slice(6)))
      } catch {
        // skip malformed
      }
    }
  }
  return events
}

// --- Tests ---

describe('Pipeline integration: prepare → compose → download', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-integration-key'
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('full pipeline produces a downloadable ZIP', async () => {
    // Step 1: Mock scrapeSite for both design and content URLs
    mockScrapeSite.mockImplementation((url: string) => {
      if (url.includes('design')) {
        return Promise.resolve({
          url,
          html: DESIGN_HTML,
          css: ':root { --primary: #f97316; } body { font-family: "Inter", sans-serif; color: #333; } nav { display: flex; gap: 1rem; }',
          title: 'Design Site',
          jsRendered: false,
        })
      }
      return Promise.resolve({
        url,
        html: CONTENT_HTML,
        css: '',
        title: 'Content Site',
        jsRendered: false,
      })
    })

    // Step 2: Call /api/prepare
    const prepareRes = await prepareGET(
      makeRequest('/api/prepare', {
        params: {
          designUrl: 'https://design.example.com',
          contentUrl: 'https://content.example.com',
        },
      })
    )

    expect(prepareRes.status).toBe(200)
    const prepData = await prepareRes.json() as {
      designSystem: DesignSystem
      pages: Array<{ slug: string; title: string; navLabel: string; url: string }>
      pageContents: PageContent[]
      model: string
      warnings: string[]
    }

    expect(prepData.designSystem).toBeDefined()
    expect(prepData.pages.length).toBeGreaterThan(0)
    expect(prepData.pageContents.length).toBe(prepData.pages.length)
    expect(prepData.model).toBe('claude-haiku-4-5-20251001')

    // Design system should have extracted tokens
    expect(prepData.designSystem.colorPalette.length).toBeGreaterThan(0)
    expect(prepData.designSystem.cssVariables).toContain('--primary')

    // Step 3: Call /api/compose for each page
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: VALID_HTML }],
      stop_reason: 'end_turn',
    })

    const clonedPages: ClonedPage[] = []

    for (let i = 0; i < prepData.pages.length; i++) {
      const composeRes = await composePOST(
        makeRequest('/api/compose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            designSystem: prepData.designSystem,
            pageContent: prepData.pageContents[i],
            allPages: prepData.pages,
            model: prepData.model,
          }),
        })
      )

      expect(composeRes.status).toBe(200)
      expect(composeRes.headers.get('Content-Type')).toBe('text/event-stream')

      const events = await readSSEEvents(composeRes)

      // Should contain at least a status event and a page_complete event
      const statusEvents = events.filter((e: unknown) => (e as { type: string }).type === 'status')
      const pageCompleteEvents = events.filter((e: unknown) => (e as { type: string }).type === 'page_complete')

      expect(statusEvents.length).toBeGreaterThan(0)
      expect(pageCompleteEvents.length).toBe(1)

      const pageEvent = pageCompleteEvents[0] as { type: string; page: ClonedPage }
      expect(pageEvent.page.html).toMatch(/^<!DOCTYPE html>/i)
      expect(pageEvent.page.slug).toBe(prepData.pages[i].slug)
      clonedPages.push(pageEvent.page)
    }

    // Step 4: Call /api/download with the cloned pages
    const downloadRes = await downloadPOST(
      makeRequest('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: clonedPages }),
      })
    )

    expect(downloadRes.status).toBe(200)
    expect(downloadRes.headers.get('Content-Type')).toBe('application/zip')
    expect(downloadRes.headers.get('Content-Disposition')).toContain('cloned-site.zip')

    // The response body should be non-empty ZIP data
    const zipBuffer = await downloadRes.arrayBuffer()
    expect(zipBuffer.byteLength).toBeGreaterThan(0)
    // ZIP magic number: PK\x03\x04
    const header = new Uint8Array(zipBuffer.slice(0, 4))
    expect(header[0]).toBe(0x50) // P
    expect(header[1]).toBe(0x4b) // K
  })

  it('compose handles Claude errors and returns error event', async () => {
    mockCreate.mockRejectedValue(new Error('Rate limited'))

    const composeRes = await composePOST(
      makeRequest('/api/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designSystem: {
            cssVariables: '',
            colorPalette: [],
            fontStack: [],
            spacing: [],
            borderRadius: [],
            componentPatterns: { nav: '', hero: '', footer: '', card: '', button: '' },
            rawCss: '',
          },
          pageContent: {
            url: 'https://example.com/',
            title: 'Home',
            slug: 'index',
            headings: [],
            paragraphs: [],
            listItems: [],
            ctaTexts: [],
            imageAlts: [],
            metaDescription: '',
          },
          allPages: [{ url: 'https://example.com/', title: 'Home', slug: 'index', navLabel: 'Home' }],
        }),
      })
    )

    const events = await readSSEEvents(composeRes)
    const errorEvents = events.filter((e: unknown) => (e as { type: string }).type === 'error')
    expect(errorEvents.length).toBe(1)
    expect((errorEvents[0] as { error: string }).error).toContain('Rate limited')
  })

  it('prepare returns warnings when design site is JS-rendered', async () => {
    mockScrapeSite.mockImplementation((url: string) => {
      if (url.includes('design')) {
        return Promise.resolve({
          url,
          html: '<html><body><div id="root"></div></body></html>',
          css: '',
          title: 'SPA',
          jsRendered: true,
        })
      }
      return Promise.resolve({
        url,
        html: CONTENT_HTML,
        css: '',
        title: 'Content Site',
        jsRendered: false,
      })
    })

    // Mock scrapeWithBrowser to return a proper site
    const { scrapeWithBrowser } = await import('@/lib/browserScraper')
    vi.mocked(scrapeWithBrowser).mockResolvedValue({
      url: 'https://design.example.com',
      html: DESIGN_HTML,
      css: '',
      title: 'Design Site',
      jsRendered: true,
    })

    const res = await prepareGET(
      makeRequest('/api/prepare', {
        params: {
          designUrl: 'https://design.example.com',
          contentUrl: 'https://content.example.com',
        },
      })
    )

    const body = await res.json() as { warnings: string[] }
    expect(body.warnings.some((w: string) => w.includes('JS rendering'))).toBe(true)
  })
})
