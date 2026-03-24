import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DesignSystem, DiscoveredPage, PageContent } from '../types'

// Mock the Anthropic SDK before importing composer
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  function MockAnthropic() {
    return { messages: { create: mockCreate } }
  }
  return { default: MockAnthropic }
})

import { composePage } from '../composer'

const makeDesign = (rawCss = 'body { color: red; }'): DesignSystem => ({
  cssVariables: '',
  colorPalette: ['#ff0000'],
  fontStack: ['Arial'],
  spacing: ['8px'],
  borderRadius: ['4px'],
  componentPatterns: { nav: '<nav/>', hero: '', footer: '', card: '', button: '' },
  rawCss,
})

const makeContent = (): PageContent => ({
  url: 'https://example.com/about',
  title: 'About',
  slug: 'about',
  headings: ['About Us'],
  paragraphs: ['We build great things.'],
  listItems: [],
  ctaTexts: ['Learn more'],
  imageAlts: [],
  metaDescription: 'About page',
})

const makePages = (): DiscoveredPage[] => [
  { url: 'https://example.com/', title: 'Home', slug: 'index', navLabel: 'Home' },
  { url: 'https://example.com/about', title: 'About', slug: 'about', navLabel: 'About' },
]

const validHtml = '<!DOCTYPE html><html><head></head><body>Hello</body></html>'

function mockResponse(text: string) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('composePage', () => {
  it('returns a string starting with <!DOCTYPE html>', async () => {
    mockResponse(validHtml)
    const result = await composePage(makeDesign(), makeContent(), makePages(), 'test-key', 'claude-haiku-4-5-20251001')
    expect(result).toMatch(/^<!DOCTYPE html>/i)
  })

  it('throws when response does not start with <!DOCTYPE html>', async () => {
    mockResponse('Here is your HTML: <!DOCTYPE html><html></html>')
    await expect(
      composePage(makeDesign(), makeContent(), makePages(), 'test-key', 'claude-haiku-4-5-20251001')
    ).rejects.toThrow('Claude did not return valid HTML')
  })

  it('throws when response is empty', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }] })
    await expect(
      composePage(makeDesign(), makeContent(), makePages(), 'test-key', 'claude-haiku-4-5-20251001')
    ).rejects.toThrow('Claude did not return valid HTML')
  })

  it('passes condensed rawCss with cssVariables as separate field', async () => {
    mockResponse(validHtml)
    // Use valid CSS with high-priority base rules that will be kept
    const baseRule = 'body { margin: 0; padding: 0; box-sizing: border-box; }'
    const longCss = baseRule.repeat(400) // well over 32K budget
    const design = makeDesign(longCss)
    design.cssVariables = ':root { --primary: #ff0000; }'
    await composePage(design, makeContent(), makePages(), 'test-key', 'claude-haiku-4-5-20251001')

    const callArg = mockCreate.mock.calls[0][0]
    const userContent = JSON.parse(callArg.messages[0].content)
    // cssVariables is a separate field (not prepended to rawCss)
    expect(userContent.designSystem.cssVariables).toContain('--primary')
    // High-priority base rules (body) are kept in condensed rawCss
    expect(userContent.designSystem.rawCss).toContain('body')
  })

  it('passes headingFontPairs, backgroundEffects, shadowValues, componentCss to composePage when present in designSystem', async () => {
    mockResponse(validHtml)
    const design = makeDesign()
    design.headingFontPairs = [
      { level: 'h1', fontFamily: 'Inter', fontSize: '48px' },
      { level: 'h2', fontFamily: 'Inter', fontSize: '36px' },
    ]
    design.backgroundEffects = ['linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 'url(bg.png)']
    design.shadowValues = ['0 4px 6px rgba(0,0,0,0.1)', '0 10px 15px rgba(0,0,0,0.1)']
    design.componentCss = {
      nav: 'nav { display: flex; }',
      hero: '.hero { padding: 4rem; }',
      footer: 'footer { background: #333; }',
      card: '.card { border-radius: 8px; }',
      button: '.btn { padding: 0.75rem 1.5rem; }',
    }

    await composePage(design, makeContent(), makePages(), 'test-key', 'claude-haiku-4-5-20251001')

    const callArg = mockCreate.mock.calls[0][0]
    const userContent = JSON.parse(callArg.messages[0].content)
    expect(userContent.designSystem.headingFontPairs).toEqual(design.headingFontPairs)
    expect(userContent.designSystem.backgroundEffects).toEqual(design.backgroundEffects)
    expect(userContent.designSystem.shadowValues).toEqual(design.shadowValues)
    expect(userContent.designSystem.componentCss).toEqual(design.componentCss)
  })

  it('strips :root blocks from rawCss (they live in cssVariables field)', async () => {
    mockResponse(validHtml)
    const cssWithRoot = ':root { --color-primary: #667eea; --spacing: 8px; } body { color: red; }'
    const design = makeDesign(cssWithRoot)
    // cssVariables is extracted separately in the real pipeline; set it here to match
    design.cssVariables = ':root { --color-primary: #667eea; --spacing: 8px; }'
    await composePage(design, makeContent(), makePages(), 'test-key', 'claude-haiku-4-5-20251001')

    const callArg = mockCreate.mock.calls[0][0]
    const userContent = JSON.parse(callArg.messages[0].content)
    // :root blocks are stripped from rawCss (they go into cssVariables)
    expect(userContent.designSystem.rawCss).not.toContain(':root')
    // The body rule is kept
    expect(userContent.designSystem.rawCss).toContain('body')
    // cssVariables field contains the :root block
    expect(userContent.designSystem.cssVariables).toContain(':root')
    expect(userContent.designSystem.cssVariables).toContain('--color-primary')
  })

  it('includes all page slugs in the navigation array', async () => {
    mockResponse(validHtml)
    const pages = makePages()
    await composePage(makeDesign(), makeContent(), pages, 'test-key', 'claude-haiku-4-5-20251001')

    const callArg = mockCreate.mock.calls[0][0]
    const userContent = JSON.parse(callArg.messages[0].content)
    const navSlugs = userContent.navigation.map((n: { slug: string }) => n.slug)
    for (const page of pages) {
      expect(navSlugs).toContain(page.slug)
    }
  })

  it('passes webFontUrl to Claude when present on design', async () => {
    mockResponse(validHtml)
    const fontUrl = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap'
    const designWithFont = { ...makeDesign(), webFontUrl: fontUrl }
    await composePage(designWithFont, makeContent(), makePages(), 'test-key', 'claude-haiku-4-5-20251001')

    const callArg = mockCreate.mock.calls[0][0]
    const userContent = JSON.parse(callArg.messages[0].content)
    expect(userContent.designSystem.webFontUrl).toBe(fontUrl)
  })

  it('omits webFontUrl from payload when not present on design', async () => {
    mockResponse(validHtml)
    await composePage(makeDesign(), makeContent(), makePages(), 'test-key', 'claude-haiku-4-5-20251001')

    const callArg = mockCreate.mock.calls[0][0]
    const userContent = JSON.parse(callArg.messages[0].content)
    expect(userContent.designSystem.webFontUrl).toBeUndefined()
  })

  it('sets navigation hrefs to slug.html format', async () => {
    mockResponse(validHtml)
    const pages = makePages()
    await composePage(makeDesign(), makeContent(), pages, 'test-key', 'claude-haiku-4-5-20251001')

    const callArg = mockCreate.mock.calls[0][0]
    const userContent = JSON.parse(callArg.messages[0].content)
    for (const page of pages) {
      const entry = userContent.navigation.find((n: { slug: string }) => n.slug === page.slug)
      expect(entry?.href).toBe(`${page.slug}.html`)
    }
  })

  it('sets currentSlug to content.slug', async () => {
    mockResponse(validHtml)
    const content = makeContent()
    await composePage(makeDesign(), content, makePages(), 'test-key', 'claude-haiku-4-5-20251001')

    const callArg = mockCreate.mock.calls[0][0]
    const userContent = JSON.parse(callArg.messages[0].content)
    expect(userContent.currentSlug).toBe(content.slug)
  })

  it('accepts <!doctype html> (lowercase) as valid', async () => {
    mockResponse('<!doctype html><html></html>')
    const result = await composePage(makeDesign(), makeContent(), makePages(), 'test-key', 'claude-haiku-4-5-20251001')
    expect(result).toMatch(/^<!doctype html>/i)
  })

  it('strips ```html code fences and returns valid HTML', async () => {
    mockResponse('```html\n' + validHtml + '\n```')
    const result = await composePage(makeDesign(), makeContent(), makePages(), 'test-key', 'claude-haiku-4-5-20251001')
    expect(result).toMatch(/^<!DOCTYPE html>/i)
  })

  it('strips plain ``` code fences and returns valid HTML', async () => {
    mockResponse('```\n' + validHtml + '\n```')
    const result = await composePage(makeDesign(), makeContent(), makePages(), 'test-key', 'claude-haiku-4-5-20251001')
    expect(result).toMatch(/^<!DOCTYPE html>/i)
  })

  it('passes the model parameter to the API call', async () => {
    mockResponse(validHtml)
    await composePage(makeDesign(), makeContent(), [], 'key', 'claude-opus-4-6')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-6' })
    )
  })

  it('uses COMPOSER_MAX_TOKENS env var when set', async () => {
    vi.stubEnv('COMPOSER_MAX_TOKENS', '2048')
    mockResponse(validHtml)
    await composePage(makeDesign(), makeContent(), [], 'key', 'claude-haiku-4-5-20251001')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 2048 })
    )
  })

  it('throws when Claude response is truncated (max_tokens)', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '<!DOCTYPE html><html><body>partial' }],
      stop_reason: 'max_tokens',
    })
    await expect(
      composePage(makeDesign(), makeContent(), makePages(), 'test-key', 'claude-haiku-4-5-20251001')
    ).rejects.toThrow('Output truncated')
  })
})
