import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRenderSite } = vi.hoisted(() => ({ mockRenderSite: vi.fn() }))
vi.mock('../renderer', () => ({ renderSite: mockRenderSite }))
import { scrapeSite } from '../scraper'

// Helper to create a mock Response
function makeResponse(body: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response
}

describe('scrapeSite', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    // Default: renderer rejects — scraper catches and returns static HTML
    mockRenderSite.mockRejectedValue(new Error('headless disabled in tests'))
  })

  it('returns a valid ScrapedSite for a simple page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse('<html><head><title>Test Page</title></head><body><p>Hello</p></body></html>')
      )
    )
    const result = await scrapeSite('https://example.com')
    expect(result.url).toBe('https://example.com')
    expect(result.title).toBe('Test Page')
    expect(result.html).toContain('<p>Hello</p>')
  })

  it('extracts the title from the <title> tag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse('<html><head><title>My Site</title></head><body></body></html>'))
    )
    const result = await scrapeSite('https://example.com')
    expect(result.title).toBe('My Site')
  })

  it('returns empty string title when no <title> tag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse('<html><head></head><body></body></html>'))
    )
    const result = await scrapeSite('https://example.com')
    expect(result.title).toBe('')
  })

  it('strips <script> tags from returned HTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse(
          '<html><head></head><body><p>Content</p><script>alert("xss")</script></body></html>'
        )
      )
    )
    const result = await scrapeSite('https://example.com')
    expect(result.html).not.toContain('<script>')
    expect(result.html).not.toContain('alert("xss")')
    expect(result.html).toContain('<p>Content</p>')
  })

  it('strips <noscript> tags from returned HTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse('<html><head></head><body><noscript>Enable JS</noscript><p>Hi</p></body></html>')
      )
    )
    const result = await scrapeSite('https://example.com')
    expect(result.html).not.toContain('<noscript>')
  })

  it('fetches linked stylesheets and includes them in css', async () => {
    const html = `
      <html>
        <head>
          <title>Styled</title>
          <link rel="stylesheet" href="/styles.css" />
        </head>
        <body></body>
      </html>
    `
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url === 'https://example.com') return Promise.resolve(makeResponse(html))
        if (url === 'https://example.com/styles.css')
          return Promise.resolve(makeResponse('body { color: red; }'))
        return Promise.resolve(makeResponse('', false, 404))
      })
    )
    const result = await scrapeSite('https://example.com')
    expect(result.css).toContain('body { color: red; }')
  })

  it('resolves relative stylesheet URLs to absolute', async () => {
    const html = `
      <html>
        <head><link rel="stylesheet" href="css/main.css" /></head>
        <body></body>
      </html>
    `
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.com/page') return Promise.resolve(makeResponse(html))
      if (url === 'https://example.com/css/main.css')
        return Promise.resolve(makeResponse('.btn { display: block; }'))
      return Promise.resolve(makeResponse('', false, 404))
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await scrapeSite('https://example.com/page')
    expect(result.css).toContain('.btn { display: block; }')
  })

  it('skips a stylesheet that returns a non-200 response', async () => {
    const html = `
      <html>
        <head>
          <link rel="stylesheet" href="/good.css" />
          <link rel="stylesheet" href="/bad.css" />
        </head>
        <body></body>
      </html>
    `
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url === 'https://example.com') return Promise.resolve(makeResponse(html))
        if (url === 'https://example.com/good.css')
          return Promise.resolve(makeResponse('.good {}'))
        if (url === 'https://example.com/bad.css')
          return Promise.resolve(makeResponse('', false, 500))
        return Promise.resolve(makeResponse('', false, 404))
      })
    )
    const result = await scrapeSite('https://example.com')
    expect(result.css).toContain('.good {}')
    // Bad stylesheet was skipped — no error thrown
  })

  it('includes inline <style> tag content in css', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse(
          '<html><head><style>h1 { font-size: 2rem; }</style></head><body></body></html>'
        )
      )
    )
    const result = await scrapeSite('https://example.com')
    expect(result.css).toContain('h1 { font-size: 2rem; }')
  })

  it('throws a descriptive error on HTTP error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Not Found', false, 404)))
    await expect(scrapeSite('https://example.com')).rejects.toThrow(
      'Failed to fetch https://example.com: HTTP 404'
    )
  })

  it('throws a descriptive timeout error when fetch is aborted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        return Promise.reject(err)
      })
    )
    await expect(scrapeSite('https://example.com')).rejects.toThrow(
      'Timeout: https://example.com did not respond within 10 seconds'
    )
  })

  it('resolves stylesheet URLs using <base href> when present', async () => {
    const html = `
      <html>
        <head>
          <base href="https://cdn.example.com/" />
          <link rel="stylesheet" href="styles/main.css" />
        </head>
        <body></body>
      </html>
    `
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.com') return Promise.resolve(makeResponse(html))
      if (url === 'https://cdn.example.com/styles/main.css')
        return Promise.resolve(makeResponse('.base-resolved {}'))
      return Promise.resolve(makeResponse('', false, 404))
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await scrapeSite('https://example.com')
    expect(result.css).toContain('.base-resolved {}')
  })

  it('captures inline script content in scripts field before stripping', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeResponse('<html><head></head><body><script>requestAnimationFrame(draw);</script></body></html>')
    ))
    const result = await scrapeSite('https://example.com')
    expect(result.scripts).toContain('requestAnimationFrame')
    expect(result.html).not.toContain('requestAnimationFrame')
  })

  it('triggers renderSite when static content is thin and API key is set', async () => {
    vi.stubEnv('BROWSERLESS_API_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeResponse('<html><head><title>Test</title></head><body><p>Hi</p></body></html>')
    ))
    mockRenderSite.mockResolvedValue('<html><head></head><body><h1>Rich</h1><h2>Content</h2><p>This is a long paragraph with sufficient content for detection.</p></body></html>')
    const result = await scrapeSite('https://example.com')
    expect(mockRenderSite).toHaveBeenCalledWith('https://example.com')
    expect(result.html).toContain('<h1>Rich</h1>')
  })

  it('skips renderSite when BROWSERLESS_API_KEY is not set even if content is thin', async () => {
    delete process.env.BROWSERLESS_API_KEY
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeResponse('<html><head><title>Test</title></head><body><p>Hi</p></body></html>')
    ))
    await scrapeSite('https://example.com')
    expect(mockRenderSite).not.toHaveBeenCalled()
  })

  it('skips renderSite when static content is rich', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeResponse('<html><head></head><body><h1>Title</h1><h2>Sub</h2><h3>Sub2</h3><p>This is a long enough paragraph to count as real content here.</p></body></html>')
    ))
    mockRenderSite.mockResolvedValue('<html>should not be used</html>')
    await scrapeSite('https://example.com')
    expect(mockRenderSite).not.toHaveBeenCalled()
  })

  it('returns static html when renderSite fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeResponse('<html><head><title>Thin</title></head><body><p>short</p></body></html>')
    ))
    mockRenderSite.mockRejectedValue(new Error('chromium unavailable'))
    const result = await scrapeSite('https://example.com')
    expect(result.url).toBe('https://example.com')
    // Should not throw — static html returned as fallback
  })
})
