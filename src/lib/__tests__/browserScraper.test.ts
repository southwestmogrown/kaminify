import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock puppeteer-core before importing the module under test.
// The vi.mock factory is hoisted to the top of the file, so it cannot
// reference variables declared outside it. The page/browser mocks are
// attached to the connect return value and overridden per-test via
// mockImplementation / mockResolvedValue on the functions below.
vi.mock('puppeteer-core', () => {
  const mockClose = vi.fn().mockResolvedValue(undefined)
  const mockDisconnect = vi.fn().mockResolvedValue(undefined)
  const mockGoto = vi.fn().mockResolvedValue(undefined)
  const mockSetUserAgent = vi.fn().mockResolvedValue(undefined)
  const mockContent = vi.fn().mockResolvedValue('<html></html>')
  const mockNewPage = vi.fn().mockResolvedValue({
    setUserAgent: mockSetUserAgent,
    goto: mockGoto,
    content: mockContent,
    close: mockClose,
  })
  return {
    default: {
      connect: vi.fn().mockResolvedValue({
        newPage: mockNewPage,
        disconnect: mockDisconnect,
      }),
    },
  }
})

// Import after mock is registered
import puppeteer from 'puppeteer-core'
import { scrapeWithBrowser } from '../browserScraper'

function makeResponse(body: string, ok = true): Response {
  return { ok, status: ok ? 200 : 500, text: () => Promise.resolve(body) } as unknown as Response
}

describe('scrapeWithBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BROWSERLESS_WS_URL = 'wss://test.example.com'
  })

  afterEach(() => {
    delete process.env.BROWSERLESS_WS_URL
    vi.unstubAllGlobals()
  })

  it('throws when BROWSERLESS_WS_URL is not set', async () => {
    delete process.env.BROWSERLESS_WS_URL
    await expect(scrapeWithBrowser('https://example.com')).rejects.toThrow(
      'BROWSERLESS_WS_URL is not configured'
    )
  })

  it('returns a valid ScrapedSite with jsRendered true', async () => {
    const html = '<html><head><title>SPA</title></head><body><div id="root"><p>Hello</p></div></body></html>'
    const connectMock = puppeteer.connect as ReturnType<typeof vi.fn>
    const mockClose = vi.fn().mockResolvedValue(undefined)
    const mockDisconnect = vi.fn().mockResolvedValue(undefined)
    connectMock.mockResolvedValueOnce({
      newPage: vi.fn().mockResolvedValue({
        setUserAgent: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue(html),
        close: mockClose,
      }),
      disconnect: mockDisconnect,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('')))
    const result = await scrapeWithBrowser('https://example.com')
    expect(result.url).toBe('https://example.com')
    expect(result.title).toBe('SPA')
    expect(result.jsRendered).toBe(true)
  })

  it('extracts inline style content', async () => {
    const html = '<html><head><style>body { color: red; }</style></head><body><p>Hi</p></body></html>'
    const connectMock = puppeteer.connect as ReturnType<typeof vi.fn>
    connectMock.mockResolvedValueOnce({
      newPage: vi.fn().mockResolvedValue({
        setUserAgent: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue(html),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      disconnect: vi.fn().mockResolvedValue(undefined),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('')))
    const result = await scrapeWithBrowser('https://example.com')
    expect(result.css).toContain('body { color: red; }')
  })

  it('fetches linked stylesheets', async () => {
    const html = '<html><head><link rel="stylesheet" href="/app.css" /></head><body><p>Hi</p></body></html>'
    const connectMock = puppeteer.connect as ReturnType<typeof vi.fn>
    connectMock.mockResolvedValueOnce({
      newPage: vi.fn().mockResolvedValue({
        setUserAgent: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue(html),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      disconnect: vi.fn().mockResolvedValue(undefined),
    })
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.com/app.css') return Promise.resolve(makeResponse('.app {}'))
      return Promise.resolve(makeResponse('', false))
    }))
    const result = await scrapeWithBrowser('https://example.com')
    expect(result.css).toContain('.app {}')
  })

  it('strips script tags from returned HTML', async () => {
    const html = '<html><head></head><body><script>alert(1)</script><p>Content</p></body></html>'
    const connectMock = puppeteer.connect as ReturnType<typeof vi.fn>
    connectMock.mockResolvedValueOnce({
      newPage: vi.fn().mockResolvedValue({
        setUserAgent: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue(html),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      disconnect: vi.fn().mockResolvedValue(undefined),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('')))
    const result = await scrapeWithBrowser('https://example.com')
    expect(result.html).not.toContain('<script>')
    expect(result.html).not.toContain('alert(1)')
    expect(result.html).toContain('<p>Content</p>')
  })

  it('injects /chromium path when BROWSERLESS_WS_URL has no path', async () => {
    process.env.BROWSERLESS_WS_URL = 'wss://test.example.com'
    const connectMock = puppeteer.connect as ReturnType<typeof vi.fn>
    connectMock.mockResolvedValueOnce({
      newPage: vi.fn().mockResolvedValue({
        setUserAgent: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue('<html></html>'),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      disconnect: vi.fn().mockResolvedValue(undefined),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('')))
    await scrapeWithBrowser('https://example.com')
    const calledWith = connectMock.mock.calls[0][0] as { browserWSEndpoint: string }
    expect(new URL(calledWith.browserWSEndpoint).pathname).toBe('/chromium')
  })

  it('does not double-append /chromium if path is already set', async () => {
    process.env.BROWSERLESS_WS_URL = 'wss://test.example.com/chromium'
    const connectMock = puppeteer.connect as ReturnType<typeof vi.fn>
    connectMock.mockResolvedValueOnce({
      newPage: vi.fn().mockResolvedValue({
        setUserAgent: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue('<html></html>'),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      disconnect: vi.fn().mockResolvedValue(undefined),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('')))
    await scrapeWithBrowser('https://example.com')
    const calledWith = connectMock.mock.calls[0][0] as { browserWSEndpoint: string }
    expect(new URL(calledWith.browserWSEndpoint).pathname).toBe('/chromium')
  })

  it('disconnects browser even when page.goto throws', async () => {
    const mockClose = vi.fn().mockResolvedValue(undefined)
    const mockDisconnect = vi.fn().mockResolvedValue(undefined)
    const connectMock = puppeteer.connect as ReturnType<typeof vi.fn>
    connectMock.mockResolvedValueOnce({
      newPage: vi.fn().mockResolvedValue({
        setUserAgent: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockRejectedValue(new Error('Navigation timeout')),
        content: vi.fn().mockResolvedValue('<html></html>'),
        close: mockClose,
      }),
      disconnect: mockDisconnect,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('')))
    await expect(scrapeWithBrowser('https://example.com')).rejects.toThrow(
      'Browser: failed to navigate to https://example.com — Navigation timeout'
    )
    expect(mockClose).toHaveBeenCalled()
    expect(mockDisconnect).toHaveBeenCalled()
  })
})
