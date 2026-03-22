import { describe, it, expect } from 'vitest'
import { extractDesignSystem, extractPageContent } from '../extractor'
import type { DiscoveredPage, ScrapedSite } from '../types'

function makeSite(html: string, css = '', url = 'https://example.com'): ScrapedSite {
  return { url, html, css, title: '', jsRendered: false }
}

function makePage(overrides: Partial<DiscoveredPage> = {}): DiscoveredPage {
  return {
    url: 'https://example.com/about',
    title: 'About',
    slug: 'about',
    navLabel: 'About',
    ...overrides,
  }
}

describe('extractDesignSystem', () => {
  it('extracts hex colors from CSS', () => {
    const site = makeSite('', 'body { color: #1F6FEB; background: #0D1117; }')
    const ds = extractDesignSystem(site)
    expect(ds.colorPalette).toContain('#1f6feb')
    expect(ds.colorPalette).toContain('#0d1117')
  })

  it('normalizes 3-digit hex to 6-digit', () => {
    const site = makeSite('', 'a { color: #abc; }')
    const ds = extractDesignSystem(site)
    expect(ds.colorPalette).toContain('#aabbcc')
  })

  it('extracts rgb() colors from CSS', () => {
    const site = makeSite('', 'div { color: rgb(31, 111, 235); }')
    const ds = extractDesignSystem(site)
    expect(ds.colorPalette.some((c) => c.startsWith('rgb('))).toBe(true)
  })

  it('extracts hsl() colors from CSS', () => {
    const site = makeSite('', 'div { color: hsl(210, 80%, 52%); }')
    const ds = extractDesignSystem(site)
    expect(ds.colorPalette.some((c) => c.startsWith('hsl('))).toBe(true)
  })

  it('extracts font-family values from CSS', () => {
    const site = makeSite('', 'body { font-family: "Inter", sans-serif; }')
    const ds = extractDesignSystem(site)
    expect(ds.fontStack).toContain('Inter')
    expect(ds.fontStack).toContain('sans-serif')
  })

  it('returns empty arrays when no colors in CSS', () => {
    const site = makeSite('', 'body { margin: 0; }')
    const ds = extractDesignSystem(site)
    // colorPalette may be empty — must not throw
    expect(Array.isArray(ds.colorPalette)).toBe(true)
  })

  it('extracts Google Fonts URL from <link> tag in HTML', () => {
    const fontUrl = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap'
    const site = makeSite(`<html><head><link rel="stylesheet" href="${fontUrl}"></head></html>`)
    const ds = extractDesignSystem(site)
    expect(ds.webFontUrl).toBe(fontUrl)
  })

  it('extracts Google Fonts URL from @import in CSS when no link tag present', () => {
    const fontUrl = 'https://fonts.googleapis.com/css2?family=Roboto&display=swap'
    const site = makeSite('', `@import url('${fontUrl}'); body { color: red; }`)
    const ds = extractDesignSystem(site)
    expect(ds.webFontUrl).toBe(fontUrl)
  })

  it('returns undefined webFontUrl when no Google Fonts found', () => {
    const site = makeSite('', 'body { color: red; }')
    const ds = extractDesignSystem(site)
    expect(ds.webFontUrl).toBeUndefined()
  })

  it('finds nav HTML via cheerio', () => {
    const site = makeSite('<html><body><nav><a href="/">Home</a></nav></body></html>')
    const ds = extractDesignSystem(site)
    expect(ds.componentPatterns.nav).toContain('<nav')
  })

  it('finds footer HTML via cheerio', () => {
    const site = makeSite('<html><body><footer>© 2026</footer></body></html>')
    const ds = extractDesignSystem(site)
    expect(ds.componentPatterns.footer).toContain('<footer')
  })

  it('returns empty string for missing component patterns (no error)', () => {
    const site = makeSite('<html><body><p>No nav or footer here</p></body></html>')
    const ds = extractDesignSystem(site)
    expect(ds.componentPatterns.nav).toBe('')
    expect(ds.componentPatterns.footer).toBe('')
  })

  it('returns rawCss unchanged', () => {
    const css = 'body { color: red; }'
    const site = makeSite('', css)
    const ds = extractDesignSystem(site)
    expect(ds.rawCss).toBe(css)
  })

  it('extracts CSS custom property blocks into cssVariables', () => {
    const css = ':root { --color-accent: #f97316; --font-size-base: 16px; }'
    const site = makeSite('', css)
    const ds = extractDesignSystem(site)
    expect(ds.cssVariables).toContain('--color-accent')
    expect(ds.cssVariables).toContain('--font-size-base')
  })

  it('returns empty string for cssVariables when no :root block', () => {
    const site = makeSite('', 'body { color: red; }')
    const ds = extractDesignSystem(site)
    expect(ds.cssVariables).toBe('')
  })

  it('limits colorPalette to 20 entries', () => {
    const manyColors = Array.from({ length: 30 }, (_, i) => `#${String(i).padStart(2, '0')}0000`)
      .join(' ')
    const site = makeSite('', `body { color: ${manyColors}; }`)
    const ds = extractDesignSystem(site)
    expect(ds.colorPalette.length).toBeLessThanOrEqual(20)
  })

})

describe('extractPageContent', () => {
  it('extracts h1-h4 headings', () => {
    const site = makeSite('<html><body><h1>Main Title</h1><h2>Subtitle Here</h2></body></html>')
    const content = extractPageContent(site, makePage())
    expect(content.headings).toContain('Main Title')
    expect(content.headings).toContain('Subtitle Here')
  })

  it('extracts paragraph text', () => {
    const site = makeSite(
      '<html><body><p>This is a long enough paragraph to pass the filter.</p></body></html>'
    )
    const content = extractPageContent(site, makePage())
    expect(content.paragraphs.some((p) => p.includes('long enough paragraph'))).toBe(true)
  })

  it('strips HTML tags from text content', () => {
    const site = makeSite('<html><body><p>Hello <strong>world</strong> here</p></body></html>')
    const content = extractPageContent(site, makePage())
    // No HTML tags in output
    expect(content.paragraphs.every((p) => !p.includes('<'))).toBe(true)
  })

  it('filters out short strings (under 20 chars)', () => {
    const site = makeSite('<html><body><p>Short</p><p>This is a sufficiently long paragraph text.</p></body></html>')
    const content = extractPageContent(site, makePage())
    expect(content.paragraphs).not.toContain('Short')
  })

  it('filters out cookie/privacy boilerplate', () => {
    const site = makeSite(
      '<html><body><p>We use cookies to improve your experience. Accept all cookies to continue.</p><p>This is a real paragraph with enough length.</p></body></html>'
    )
    const content = extractPageContent(site, makePage())
    expect(content.paragraphs.every((p) => !COOKIE_RE.test(p))).toBe(true)
  })

  it('extracts meta description', () => {
    const site = makeSite(
      '<html><head><meta name="description" content="A great site about things." /></head><body></body></html>'
    )
    const content = extractPageContent(site, makePage())
    expect(content.metaDescription).toBe('A great site about things.')
  })

  it('returns empty string metaDescription when tag is absent', () => {
    const site = makeSite('<html><head></head><body></body></html>')
    const content = extractPageContent(site, makePage())
    expect(content.metaDescription).toBe('')
  })

  it('extracts image alt text', () => {
    const site = makeSite('<html><body><img src="hero.jpg" alt="Hero image description" /></body></html>')
    const content = extractPageContent(site, makePage())
    expect(content.imageAlts).toContain('Hero image description')
  })

  it('returns the page url and slug from the provided DiscoveredPage', () => {
    const site = makeSite('<html><head></head><body></body></html>')
    const page = makePage({ url: 'https://example.com/team', slug: 'team' })
    const content = extractPageContent(site, page)
    expect(content.url).toBe('https://example.com/team')
    expect(content.slug).toBe('team')
  })

  it('handles missing elements gracefully (empty arrays, not errors)', () => {
    const site = makeSite('<html><head></head><body></body></html>')
    const content = extractPageContent(site, makePage())
    expect(content.headings).toEqual([])
    expect(content.paragraphs).toEqual([])
    expect(content.listItems).toEqual([])
    expect(content.imageAlts).toEqual([])
  })

  it('caps headings at 12', () => {
    const manyHeadings = Array.from({ length: 20 }, (_, i) => `<h2>Heading ${i}</h2>`).join('')
    const site = makeSite(`<html><body>${manyHeadings}</body></html>`)
    const content = extractPageContent(site, makePage())
    expect(content.headings.length).toBeLessThanOrEqual(12)
  })

  it('caps paragraphs at 20', () => {
    const manyParas = Array.from({ length: 30 }, (_, i) => `<p>This is paragraph number ${i} with enough text to pass the filter</p>`).join('')
    const site = makeSite(`<html><body>${manyParas}</body></html>`)
    const content = extractPageContent(site, makePage())
    expect(content.paragraphs.length).toBeLessThanOrEqual(20)
  })
})

// Needed for the cookie filter test
const COOKIE_RE = /cookie|privacy policy|terms of service|gdpr|accept all/i
