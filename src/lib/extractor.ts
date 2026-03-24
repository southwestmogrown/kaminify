import * as cheerio from 'cheerio'
import type { DesignSystem, DiscoveredPage, PageContent, ScrapedSite } from './types'

// --- Design System Extraction ---

const CSS_VARIABLE_RE = /:root\s*\{([^}]*)\}/g
const PATTERN_CHAR_LIMIT = 2500
const COLOR_LIMIT = 20

const MAX_HEADINGS = 12
const MAX_PARAGRAPHS = 20
const MAX_LIST_ITEMS = 25
const MAX_CTA_TEXTS = 8
const MAX_IMAGE_ALTS = 12
const MAX_BACKGROUND_EFFECTS = 10
const MAX_SHADOW_VALUES = 10
const MAX_COMPONENT_CSS = 1500

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

export function extractHeadingFontPairs(css: string): Array<{ level: string; fontFamily: string; fontSize: string }> {
  const pairs: Array<{ level: string; fontFamily: string; fontSize: string }> = []
  const re = /^(h[1-6])\s*\{([^}]*)\}/gm
  let match
  while ((match = re.exec(css)) !== null) {
    const level = match[1]
    const block = match[2]
    const fontFamilyMatch = block.match(/font-family\s*:\s*([^;}{]+)/)
    const fontSizeMatch = block.match(/font-size\s*:\s*([^;}{]+)/)
    if (fontFamilyMatch || fontSizeMatch) {
      pairs.push({
        level,
        fontFamily: fontFamilyMatch ? fontFamilyMatch[1].split(',')[0].trim().replace(/['"]/g, '') : '',
        fontSize: fontSizeMatch ? fontSizeMatch[1].trim() : '',
      })
    }
  }
  return pairs
}

const BACKGROUND_IMAGE_RE = /background(?:-image)?\s*:\s*([^;]+)/g

export function extractBackgroundEffects(css: string): string[] {
  const found = new Set<string>()
  for (const match of css.matchAll(BACKGROUND_IMAGE_RE)) {
    const value = match[1].trim()
    if (value !== 'none' && value !== '') {
      found.add(value)
    }
  }
  return [...found].slice(0, MAX_BACKGROUND_EFFECTS)
}

const SHADOW_RE = /(?:box-shadow|text-shadow)\s*:\s*([^;]+)/g

export function extractShadowValues(css: string): string[] {
  const found = new Set<string>()
  for (const match of css.matchAll(SHADOW_RE)) {
    const value = match[1].trim()
    if (value !== 'none' && value !== '') {
      found.add(value)
    }
  }
  return [...found].slice(0, MAX_SHADOW_VALUES)
}

/**
 * Helper function to check if a CSS selector matches any of the HTML selectors.
 */
function selectorMatchesCssSelector(selector: string, htmlSelectors: Set<string>): boolean {
  // For attribute selectors like [class*="btn"], extract attr name and value
  if (selector.includes('[')) {
    const attrMatch = selector.match(/\[[^\]=]+([*^$|~]?=)\s*["']?([^"'\]]+)["']?\s*\]/)
    if (attrMatch) {
      const attrValue = attrMatch[2]
      for (const s of htmlSelectors) {
        // For class selectors like .btn, check if the attrValue is contained
        const simpleSel = s.replace('.', '').replace('#', '')
        const matchesValue = s.includes(attrValue) || attrValue.includes(simpleSel)
        if (matchesValue) return true
      }
    }
  }

  // Escape regex special chars for literal matching
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    const re = new RegExp(`^${escaped}$|^${escaped}(?=[.,:#])|${escaped}$`)
    for (const s of htmlSelectors) {
      if (re.test(s)) return true
    }
  } catch {
    // Invalid regex, try literal match
  }

  // Fallback: literal match
  for (const s of htmlSelectors) {
    if (s === selector || selector === '*' || selector.includes(s) || s.includes(selector)) {
      return true
    }
  }
  return false
}

/**
 * Extract all CSS rules matching elements in the given HTML snippet.
 * Handles class selectors, id selectors, tag selectors, compound selectors,
 * pseudo-classes, pseudo-elements, and attribute selectors.
 */
export function extractComponentCss(css: string, html: string): string {
  if (!html || !css) return ''

  const $ = cheerio.load(html)
  const selectors = new Set<string>()

  // Collect all class names from the HTML
  $('[class]').each((_, el) => {
    const classes = ($(el).attr('class') ?? '').split(/\s+/)
    for (const cls of classes) {
      if (cls) selectors.add('.' + cls)
    }
  })

  // Collect all IDs from the HTML
  $('[id]').each((_, el) => {
    const id = ($(el).attr('id') ?? '').trim()
    if (id) selectors.add('#' + id)
  })

  // Collect all tag names from the HTML
  $('*').each((_, el) => {
    const tagName = (el as { tagName?: string }).tagName?.toLowerCase()
    if (tagName) selectors.add(tagName)
  })

  if (selectors.size === 0) return ''

  const matchingRules: string[] = []

  function processCssBlock(cssStr: string) {
    const len = cssStr.length
    let idx = 0

    while (idx < len) {
      // Handle @-rules — recursively process their content too
      if (cssStr[idx] === '@') {
        // Skip to opening brace of @-rule
        while (idx < len && cssStr[idx] !== '{') idx++
        if (idx >= len) break
        const atBlockStart = idx + 1
        // Skip the { and find the matching }
        let depth = 0
        while (idx < len) {
          if (cssStr[idx] === '{') { depth++; idx++; }
          else if (cssStr[idx] === '}') {
            depth--
            if (depth === 0) {
              // Extract and recursively process content inside the @-rule
              const atBlockContent = cssStr.slice(atBlockStart, idx)
              processCssBlock(atBlockContent)
              idx++
              break
            }
            idx++
          } else {
            idx++
          }
        }
        continue
      }

      // Find next opening brace
      const bracePos = cssStr.indexOf('{', idx)
      if (bracePos === -1) break

      const possibleSelector = cssStr.slice(idx, bracePos).trim()
      if (possibleSelector) {
        // Split on comma for multiple selectors (e.g., ".a, .b { }")
        const individualSelectors = possibleSelector.split(',').map(s => s.trim())
        let anyMatch = false

        for (const sel of individualSelectors) {
          // Strip pseudo-elements/classes for matching
          const baseSel = sel.split(/::?/)[0]
          if (!baseSel) continue

          if (selectorMatchesCssSelector(baseSel, selectors)) {
            anyMatch = true
            break
          }
        }

        if (anyMatch) {
          // Extract the full rule block
          let depth = 0
          const blockStart = bracePos
          while (idx < len) {
            if (cssStr[idx] === '{') depth++
            else if (cssStr[idx] === '}') {
              depth--
              if (depth === 0) {
                matchingRules.push(possibleSelector + cssStr.slice(blockStart, idx + 1))
                idx++
                break
              }
            }
            idx++
          }
          continue
        }
      }

      // Skip to next selector (move past the {...} block)
      let depth = 0
      while (idx < len) {
        if (cssStr[idx] === '{') { depth++; idx++; break }
        idx++
      }
      while (idx < len && depth > 0) {
        if (cssStr[idx] === '{') depth++
        else if (cssStr[idx] === '}') depth--
        idx++
      }
    }
  }

  processCssBlock(css)

  const combined = matchingRules.join(' ')
  return combined.length > MAX_COMPONENT_CSS ? combined.slice(0, MAX_COMPONENT_CSS) : combined
}

const GOOGLE_FONT_IMPORT_RE =/(?:@import\s+url\(['"]?|@import\s+['"])(https:\/\/fonts\.googleapis\.com[^'")\s]+)/

function extractWebFontUrl(html: string, css: string): string | undefined {
  // Prefer the <link> tag in HTML — canonical URL before the scraper fetches it
  const $html = cheerio.load(html)
  const linkHref = $html('link[rel="stylesheet"][href*="fonts.googleapis.com"]').first().attr('href')
  if (linkHref) return linkHref

  // Fallback: @import in concatenated CSS
  const match = css.match(GOOGLE_FONT_IMPORT_RE)
  return match?.[1]
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

  const webFontUrl = extractWebFontUrl(site.html, site.css)

  return {
    cssVariables: extractCssVariables(site.css),
    colorPalette: extractColors(site.css),
    fontStack: extractFonts(site.css),
    spacing: extractSpacing(site.css),
    borderRadius: extractBorderRadius(site.css),
    headingFontPairs: extractHeadingFontPairs(site.css),
    backgroundEffects: extractBackgroundEffects(site.css),
    shadowValues: extractShadowValues(site.css),
    componentCss: {
      nav: extractComponentCss(site.css, nav),
      hero: extractComponentCss(site.css, hero),
      footer: extractComponentCss(site.css, footer),
      card: extractComponentCss(site.css, card),
      button: extractComponentCss(site.css, button),
    },
    componentPatterns: { nav, hero, footer, card, button },
    rawCss: site.css,
    ...(webFontUrl ? { webFontUrl } : {}),
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
    headings: headings.slice(0, MAX_HEADINGS),
    paragraphs: paragraphs.slice(0, MAX_PARAGRAPHS),
    listItems: listItems.slice(0, MAX_LIST_ITEMS),
    ctaTexts: ctaTexts.slice(0, MAX_CTA_TEXTS),
    imageAlts: imageAlts.slice(0, MAX_IMAGE_ALTS),
    metaDescription,
  }
}
