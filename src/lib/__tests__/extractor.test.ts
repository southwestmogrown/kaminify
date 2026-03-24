import { describe, it, expect } from 'vitest'
import { extractDesignSystem, extractPageContent, extractHeadingFontPairs, extractBackgroundEffects, extractShadowValues, extractComponentCss } from '../extractor'
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

describe('extractHeadingFontPairs', () => {
  it('extracts h1-h6 font-family and font-size pairs from CSS', () => {
    const css = `h1 { font-family: "Playfair Display", serif; font-size: 48px; }
h2 { font-family: "Inter", sans-serif; font-size: 36px; }
h3 { font-size: 24px; }`
    const pairs = extractHeadingFontPairs(css)
    expect(pairs).toContainEqual({ level: 'h1', fontFamily: 'Playfair Display', fontSize: '48px' })
    expect(pairs).toContainEqual({ level: 'h2', fontFamily: 'Inter', fontSize: '36px' })
    expect(pairs).toContainEqual({ level: 'h3', fontFamily: '', fontSize: '24px' })
  })

  it('returns empty array when no heading rules exist', () => {
    const css = 'body { color: red; }'
    const pairs = extractHeadingFontPairs(css)
    expect(pairs).toEqual([])
  })

  it('handles headings without font-family', () => {
    const css = 'h4 { font-size: 20px; color: blue; }'
    const pairs = extractHeadingFontPairs(css)
    expect(pairs).toContainEqual({ level: 'h4', fontFamily: '', fontSize: '20px' })
  })

  it('handles headings without font-size', () => {
    const css = 'h5 { font-family: Arial; color: green; }'
    const pairs = extractHeadingFontPairs(css)
    expect(pairs).toContainEqual({ level: 'h5', fontFamily: 'Arial', fontSize: '' })
  })
})

describe('extractBackgroundEffects', () => {
  it('extracts background-image values', () => {
    const css = 'div { background-image: url("bg.png"); }'
    const effects = extractBackgroundEffects(css)
    expect(effects).toContain('url("bg.png")')
  })

  it('extracts linear-gradient values', () => {
    const css = '.hero { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }'
    const effects = extractBackgroundEffects(css)
    expect(effects.some(e => e.includes('linear-gradient'))).toBe(true)
  })

  it('extracts radial-gradient values', () => {
    const css = 'section { background: radial-gradient(circle, #ff6b6b, #ffa500); }'
    const effects = extractBackgroundEffects(css)
    expect(effects.some(e => e.includes('radial-gradient'))).toBe(true)
  })

  it('filters out "none" values', () => {
    const css = 'div { background-image: none; }'
    const effects = extractBackgroundEffects(css)
    expect(effects).not.toContain('none')
  })

  it('limits to 10 background effects', () => {
    const many = Array.from({ length: 15 }, (_, i) => `linear-gradient(${i}deg, #000, #fff)`).join('; ')
    const css = `body { background: ${many}; }`
    const effects = extractBackgroundEffects(css)
    expect(effects.length).toBeLessThanOrEqual(10)
  })

  it('returns empty array when no background effects found', () => {
    const css = 'p { color: red; }'
    const effects = extractBackgroundEffects(css)
    expect(effects).toEqual([])
  })
})

describe('extractShadowValues', () => {
  it('extracts box-shadow values', () => {
    const css = 'div { box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }'
    const shadows = extractShadowValues(css)
    expect(shadows).toContain('0 4px 6px rgba(0, 0, 0, 0.1)')
  })

  it('extracts text-shadow values', () => {
    const css = 'h1 { text-shadow: 2px 2px 4px #000; }'
    const shadows = extractShadowValues(css)
    expect(shadows).toContain('2px 2px 4px #000')
  })

  it('filters out "none" values', () => {
    const css = 'div { box-shadow: none; }'
    const shadows = extractShadowValues(css)
    expect(shadows).not.toContain('none')
  })

  it('limits to 10 shadow values', () => {
    const many = Array.from({ length: 15 }, (_, i) => `${i}px ${i}px #000`).join('; ')
    const css = `body { box-shadow: ${many}; }`
    const shadows = extractShadowValues(css)
    expect(shadows.length).toBeLessThanOrEqual(10)
  })

  it('returns empty array when no shadow values found', () => {
    const css = 'p { color: red; }'
    const shadows = extractShadowValues(css)
    expect(shadows).toEqual([])
  })
})

describe('extractComponentCss', () => {
  it('extracts CSS rules matching class selectors in HTML', () => {
    const css = '.nav { display: flex; } .nav a { color: white; }'
    const html = '<nav class="nav"><a href="/">Home</a></nav>'
    const result = extractComponentCss(css, html)
    expect(result).toContain('.nav')
    expect(result).toContain('display: flex')
  })

  it('extracts CSS rules matching id selectors in HTML', () => {
    const css = '#header { background: blue; }'
    const html = '<div id="header"></div>'
    const result = extractComponentCss(css, html)
    expect(result).toContain('#header')
    expect(result).toContain('background: blue')
  })

  it('extracts CSS rules matching tag selectors in HTML', () => {
    const css = 'nav { background: black; } nav a { text-decoration: none; }'
    const html = '<nav><a href="/">Link</a></nav>'
    const result = extractComponentCss(css, html)
    expect(result).toContain('nav')
  })

  it('handles compound selectors by checking any part matches', () => {
    const css = '.btn-primary:hover { background: blue; }'
    const html = '<button class="btn-primary">Click</button>'
    const result = extractComponentCss(css, html)
    expect(result).toContain('.btn-primary:hover')
  })

  it('handles pseudo-elements (::before, ::after)', () => {
    const css = '.card::before { content: ""; } .card::after { clear: both; }'
    const html = '<div class="card"></div>'
    const result = extractComponentCss(css, html)
    expect(result).toContain('.card::before')
    expect(result).toContain('.card::after')
  })

  it('handles attribute selectors like [class*="btn"]', () => {
    const css = '[class*="btn"] { padding: 10px; }'
    const html = '<button class="btn">Click</button>'
    const result = extractComponentCss(css, html)
    expect(result).toContain('[class*="btn"]')
  })

  it('caps extracted CSS at 1500 characters', () => {
    const longRule = 'a'.repeat(2000)
    const css = `.nav { color: ${longRule}; }`
    const html = '<nav class="nav"><a href="/">Home</a></nav>'
    const result = extractComponentCss(css, html)
    expect(result.length).toBeLessThanOrEqual(1500)
  })

  it('returns empty string when html is empty', () => {
    const css = '.nav { color: red; }'
    const result = extractComponentCss(css, '')
    expect(result).toBe('')
  })

  it('returns empty string when css is empty', () => {
    const html = '<nav class="nav"></nav>'
    const result = extractComponentCss('', html)
    expect(result).toBe('')
  })

  it('skips @-rules (media queries, keyframes, etc.) without matching selectors', () => {
    const css = '@media (min-width: 768px) { .nav { display: flex; } } @keyframes fade { from { opacity: 0; } }'
    const html = '<nav class="nav"></nav>'
    const result = extractComponentCss(css, html)
    // Should not throw and should still extract .nav if it matches
    expect(result).toContain('.nav')
  })
})

describe('extractDesignSystem new fields', () => {
  it('populates headingFontPairs from CSS', () => {
    const css = 'h1 { font-family: Arial; font-size: 48px; } h2 { font-size: 36px; }'
    const site = makeSite('', css)
    const ds = extractDesignSystem(site)
    expect(ds.headingFontPairs).toBeDefined()
    expect(ds.headingFontPairs!.length).toBeGreaterThan(0)
  })

  it('populates backgroundEffects from CSS', () => {
    const css = '.hero { background: linear-gradient(#000, #fff); }'
    const site = makeSite('', css)
    const ds = extractDesignSystem(site)
    expect(ds.backgroundEffects).toBeDefined()
    expect(ds.backgroundEffects!.length).toBeGreaterThan(0)
  })

  it('populates shadowValues from CSS', () => {
    const css = 'div { box-shadow: 0 2px 4px rgba(0,0,0,0.1); }'
    const site = makeSite('', css)
    const ds = extractDesignSystem(site)
    expect(ds.shadowValues).toBeDefined()
    expect(ds.shadowValues!.length).toBeGreaterThan(0)
  })

  it('populates componentCss for nav when nav HTML exists', () => {
    const css = 'nav { background: #000; } nav a { color: #fff; }'
    const html = '<nav class="main-nav"><a href="/">Home</a></nav>'
    const site = makeSite(html, css)
    const ds = extractDesignSystem(site)
    expect(ds.componentCss).toBeDefined()
    expect(ds.componentCss!.nav).toContain('nav')
    expect(ds.componentCss!.nav).toContain('background')
  })

  it('returns empty componentCss strings when components not found', () => {
    const site = makeSite('<html><body><p>No components here</p></body></html>', 'p { color: red; }')
    const ds = extractDesignSystem(site)
    expect(ds.componentCss).toBeDefined()
    expect(ds.componentCss!.nav).toBe('')
    expect(ds.componentCss!.hero).toBe('')
    expect(ds.componentCss!.footer).toBe('')
    expect(ds.componentCss!.card).toBe('')
    expect(ds.componentCss!.button).toBe('')
  })

  it('is backward-compatible — existing fields still exist', () => {
    const site = makeSite('', 'body { color: red; }')
    const ds = extractDesignSystem(site)
    expect(ds.cssVariables).toBeDefined()
    expect(ds.colorPalette).toBeDefined()
    expect(ds.fontStack).toBeDefined()
    expect(ds.spacing).toBeDefined()
    expect(ds.borderRadius).toBeDefined()
    expect(ds.componentPatterns).toBeDefined()
    expect(ds.rawCss).toBeDefined()
  })
})
