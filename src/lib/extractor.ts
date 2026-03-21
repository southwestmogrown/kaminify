import * as cheerio from 'cheerio'
import type { DesignSystem, DiscoveredPage, PageContent, ScrapedSite } from './types'

// --- Design System Extraction ---

const CSS_VARIABLE_RE = /:root\s*\{([^}]*)\}/g
const PATTERN_CHAR_LIMIT = 1200
const COLOR_LIMIT = 20

const HEX_RE = /#([0-9a-fA-F]{3,8})\b/g
const RGB_RE = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+[^)]*\)/g
const HSL_RE = /hsla?\(\s*[\d.]+\s*,\s*[\d.%]+\s*,\s*[\d.%]+[^)]*\)/g
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}{]+)/g
const SPACING_RE = /(?:margin|padding)\s*:\s*([^;}{]+)/g
const BORDER_RADIUS_RE = /border-radius\s*:\s*([^;}{]+)/g

function extractCssVariables(css: string): string {
  const blocks: string[] = []
  let match
  const re = new RegExp(CSS_VARIABLE_RE.source, 'g')
  while ((match = re.exec(css)) !== null) {
    blocks.push(`:root {${match[1]}}`)
  }
  return blocks.join('\n')
}

function normalizeHex(hex: string): string {
  const h = hex.replace('#', '').toLowerCase()
  if (h.length === 3) {
    return '#' + h.split('').map((c) => c + c).join('')
  }
  return '#' + h.slice(0, 6)
}

function extractColors(css: string): string[] {
  const found = new Set<string>()
  for (const match of css.matchAll(HEX_RE)) {
    found.add(normalizeHex(match[0]))
  }
  for (const match of css.matchAll(RGB_RE)) {
    found.add(match[0].replace(/\s+/g, ' '))
  }
  for (const match of css.matchAll(HSL_RE)) {
    found.add(match[0].replace(/\s+/g, ' '))
  }
  return [...found].slice(0, COLOR_LIMIT)
}

function extractFonts(css: string): string[] {
  const found = new Set<string>()
  for (const match of css.matchAll(FONT_FAMILY_RE)) {
    const families = match[1].split(',')
    for (const f of families) {
      const cleaned = f.trim().replace(/['"]/g, '').trim()
      if (cleaned) found.add(cleaned)
    }
  }
  return [...found]
}

function extractSpacing(css: string): string[] {
  const found = new Set<string>()
  for (const match of css.matchAll(SPACING_RE)) {
    const values = match[1].trim().split(/\s+/)
    for (const v of values) {
      if (/^\d/.test(v)) found.add(v)
    }
  }
  return [...found].slice(0, 20)
}

function extractBorderRadius(css: string): string[] {
  const found = new Set<string>()
  for (const match of css.matchAll(BORDER_RADIUS_RE)) {
    const values = match[1].trim().split(/\s+/)
    for (const v of values) {
      if (/^\d/.test(v)) found.add(v)
    }
  }
  return [...found].slice(0, 10)
}

function findComponent($: cheerio.CheerioAPI, selectors: string[]): string {
  for (const sel of selectors) {
    const el = $(sel).first()
    if (el.length) return $.html(el).slice(0, PATTERN_CHAR_LIMIT)
  }
  return ''
}

export function extractDesignSystem(site: ScrapedSite): DesignSystem {
  const $ = cheerio.load(site.html)

  const nav = findComponent($, [
    'nav',
    '[role="navigation"]',
    '.nav',
    '#nav',
    'header nav',
  ])

  const hero = findComponent($, [
    '.hero',
    '[class*="hero"]',
    'section:first-of-type',
    'header + section',
    'main > section:first-child',
  ])

  const footer = findComponent($, [
    'footer',
    '[role="contentinfo"]',
    '.footer',
    '#footer',
  ])

  const card = findComponent($, [
    '[class*="card"]:first-of-type',
    'article:first-of-type',
    '.card:first-of-type',
  ])

  const button = findComponent($, [
    'a[class*="btn"]:first-of-type',
    'button:first-of-type',
    'a.button:first-of-type',
    '[class*="cta"]:first-of-type',
  ])

  return {
    cssVariables: extractCssVariables(site.css),
    colorPalette: extractColors(site.css),
    fontStack: extractFonts(site.css),
    spacing: extractSpacing(site.css),
    borderRadius: extractBorderRadius(site.css),
    componentPatterns: { nav, hero, footer, card, button },
    rawCss: site.css,
  }
}

// --- Page Content Extraction ---

const COOKIE_RE = /cookie|privacy policy|terms of service|gdpr|accept all/i
const MIN_TEXT_LENGTH = 20

function cleanText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')      // strip any residual HTML tags
    .replace(/\s+/g, ' ')         // collapse whitespace
    .trim()
}

function isUsableText(text: string): boolean {
  if (text.length < MIN_TEXT_LENGTH) return false
  if (COOKIE_RE.test(text)) return false
  return true
}

export function extractPageContent(site: ScrapedSite, page: DiscoveredPage): PageContent {
  const $ = cheerio.load(site.html)

  const headings: string[] = []
  $('h1, h2, h3, h4').each((_, el) => {
    const text = cleanText($(el).text())
    if (text.length > 0) headings.push(text)
  })

  const paragraphs: string[] = []
  $('p').each((_, el) => {
    const text = cleanText($(el).text())
    if (isUsableText(text)) paragraphs.push(text)
  })

  const listItems: string[] = []
  $('li').each((_, el) => {
    const text = cleanText($(el).text())
    if (isUsableText(text)) listItems.push(text)
  })

  const ctaTexts: string[] = []
  $('button, a[class*="btn"], a[class*="cta"], [class*="button"]').each((_, el) => {
    const text = cleanText($(el).text())
    if (text.length > 0 && text.length < 100) ctaTexts.push(text)
  })

  const imageAlts: string[] = []
  $('img[alt]').each((_, el) => {
    const alt = ($(el).attr('alt') ?? '').trim()
    if (alt.length > 0) imageAlts.push(alt)
  })

  const metaDescription =
    $('meta[name="description"]').attr('content')?.trim() ?? ''

  return {
    url: page.url,
    title: page.title,
    slug: page.slug,
    headings,
    paragraphs,
    listItems,
    ctaTexts,
    imageAlts,
    metaDescription,
  }
}
