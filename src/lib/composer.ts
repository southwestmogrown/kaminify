import Anthropic from '@anthropic-ai/sdk'
import type { DesignSystem, DiscoveredPage, PageContent } from './types'

// Regex to match a full CSS rule: selector { ... }
const CSS_RULE_RE = /([^{]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g

// Keywords in a selector that indicate a high-priority base/layout rule.
const LAYOUT_SELECTOR_KEYWORDS = [
  'body', 'html', ':root', '*:not', '::before', '::after',
  'grid', 'flex', 'container', 'wrapper', 'layout', 'container',
  'section', 'main', 'header', 'footer', 'aside',
]

// Build a condensed rawCss that strips what we've already extracted as structured
// fields, deduplicates component rules, and prioritizes layout/base rules.
// This keeps Claude's prompt under the token limit while preserving the most useful CSS.
function buildCondensedCss(
  rawCss: string,
  componentCss: { nav: string; hero: string; footer: string; card: string; button: string } | undefined,
  maxChars: number,
): string {
  // Collect all selectors already captured in componentCss to avoid duplication
  const knownSelectors = new Set<string>()
  if (componentCss) {
    for (const css of Object.values(componentCss)) {
      let match
      const re = new RegExp(CSS_RULE_RE.source, 'g')
      while ((match = re.exec(css)) !== null) {
        for (const sel of match[1].split(',')) {
          knownSelectors.add(sel.trim())
        }
      }
    }
  }

  // Strip :root blocks (they go into cssVariables field, not rawCss)
  const strippedCss = rawCss.replace(/:root\s*\{[^{}]*\}/g, '')

  // Rules to keep, in priority order
  const highPriorityRules: string[] = []
  const otherRules: string[] = []
  let budget = maxChars

  let match
  const re = new RegExp(CSS_RULE_RE.source, 'g')
  while ((match = re.exec(strippedCss)) !== null && budget > 0) {
    const selector = match[1].trim()
    const block = match[2]
    const rule = selector + '{' + block + '}'

    // Skip already-duplicated component selectors
    const individualSels = selector.split(',').map(s => s.trim())
    const isKnown = individualSels.every(s => knownSelectors.has(s))
    if (isKnown) continue

    // High-priority: base/layout selectors
    const isLayout = LAYOUT_SELECTOR_KEYWORDS.some(kw => selector.includes(kw))
    if (isLayout) {
      if (rule.length <= budget) {
        highPriorityRules.push(rule)
        budget -= rule.length
      }
    } else {
      if (rule.length <= budget) {
        otherRules.push(rule)
        budget -= rule.length
      }
    }
  }

  return [...highPriorityRules, ...otherRules].join(' ')
}

const SYSTEM_PROMPT = `You are an expert web developer. Given a design system and page content, build a polished, complete, self-contained HTML page.

Hard constraints:
- Output ONLY the HTML document starting with <!DOCTYPE html>. No markdown, no code fences, no explanation.
- Fully self-contained: all CSS in a <style> block, no @import, no CDN links. If webFontUrl is provided in designSystem, inject exactly one <link rel="stylesheet" href="...webFontUrl..."> as the first element inside <head>; otherwise use headingFontPairs as the primary font source, with system font stacks as fallback only if headingFontPairs is empty.
- Use only the text provided in pageContent — do not invent copy, statistics, or names.
- Include navigation linking all pages; use the href field from each navigation entry as the anchor href attribute; mark currentSlug as active.
- Do not apply decorative li::before or li::after pseudo-elements as a global rule — scope them to specific named component classes only.

Apply the design tokens, color palette, component patterns, and layout feel from the design system faithfully. Make it responsive and production-quality. Write efficient, minimal CSS — avoid redundancy. The complete page must fit in a single response.

Use the headingFontPairs to replicate the typographic hierarchy — apply each h1-h6 font-family and fontSize from the design system.

Apply the backgroundEffects (gradients, images) to appropriate elements — hero sections, cards, page backgrounds.

Apply the shadowValues to elements that have elevation — cards, modals, buttons with depth.

The componentCss object contains the actual CSS rules for the nav, hero, footer, card, and button patterns — use these rules to style the corresponding HTML elements in your output.

CRITICAL — Design fidelity: Do NOT invent, assume, or import any CSS class names, color values, font choices, or design tokens not explicitly provided in this message. Do NOT reference or replicate the visual design of any named brand or website (including the design source itself) based on your training knowledge — only use what is in the designSystem fields provided here.`

const VISION_SYSTEM_PROMPT = `You are an expert web developer with visual design analysis skills. Given screenshots of a design donor website and a content donor website, build a polished, complete, self-contained HTML page inspired by the design donor's visual identity.

Analyze the screenshots carefully:
- Identify the dominant and accent colors (infer approximate hex values from what you see)
- Note the typography: font sizes, weights, hierarchy
- Observe the layout feel: spacing, padding, grid/flex patterns
- Note any gradients, shadows, borders, or visual effects
- Identify the overall mood: corporate, playful, minimal, bold, etc.

Then build the page using the content from the second screenshot (the content donor), applying the visual design language from the first screenshot (the design donor).

Hard constraints:
- Output ONLY the HTML document starting with <!DOCTYPE html>. No markdown, no code fences, no explanation.
- Fully self-contained: all CSS in a <style> block, no @import, no CDN links. If webFontUrl is provided in designSystem, inject exactly one <link rel="stylesheet" href="...webFontUrl..."> as the first element inside <head>; otherwise use the fonts visible in the screenshots as your primary source, with system font stacks as fallback.
- Use only the text provided in pageContent — do not invent copy, statistics, or names.
- Include navigation linking all pages; use the href field from each navigation entry as the anchor href attribute; mark currentSlug as active.
- Do not apply decorative li::before or li::after pseudo-elements as a global rule — scope them to specific named component classes only.

Apply colors, typography, spacing, and visual effects you observed in the design donor screenshot. Make it responsive and production-quality. The complete page must fit in a single response.`

export async function composePage(
  design: DesignSystem,
  content: PageContent,
  allPages: DiscoveredPage[],
  apiKey: string,
  model: string,
  screenshots?: {
    design: string   // base64 PNG
    content: string  // base64 PNG
  }
): Promise<string> {
  const client = new Anthropic({ apiKey })

  // Smart CSS truncation: dedupes component rules, prioritizes layout/base rules,
  // strips already-extracted :root blocks. Keeps prompt under token limit.
  // Note: cssVariables is passed as its own field — no need to prepend it to rawCss.
  const MAX_RAW_CSS = 32000
  const rawCssSnippet = buildCondensedCss(
    design.rawCss,
    design.componentCss,
    MAX_RAW_CSS,
  )

  const designSystemPayload = {
    cssVariables: design.cssVariables,
    colorPalette: design.colorPalette,
    fontStack: design.fontStack,
    componentPatterns: design.componentPatterns,
    rawCss: rawCssSnippet,
    ...(design.webFontUrl ? { webFontUrl: design.webFontUrl } : {}),
    ...(design.headingFontPairs ? { headingFontPairs: design.headingFontPairs } : {}),
    ...(design.backgroundEffects ? { backgroundEffects: design.backgroundEffects } : {}),
    ...(design.shadowValues ? { shadowValues: design.shadowValues } : {}),
    ...(design.componentCss ? { componentCss: design.componentCss } : {}),
  }

  const pageContentPayload = {
    title: content.title,
    headings: content.headings,
    paragraphs: content.paragraphs,
    listItems: content.listItems,
    ctaTexts: content.ctaTexts,
    imageAlts: content.imageAlts,
    metaDescription: content.metaDescription,
  }

  const navigationPayload = allPages.map((p) => ({ slug: p.slug, label: p.navLabel, href: `${p.slug}.html` }))

  const maxTokens = (() => {
    const val = parseInt(process.env.COMPOSER_MAX_TOKENS ?? '16384', 10)
    return Number.isNaN(val) ? 8192 : val
  })()

  const systemPrompt = screenshots ? VISION_SYSTEM_PROMPT : SYSTEM_PROMPT

  // Vision path: screenshots provided → use Claude Sonnet with image blocks
  // Text path: no screenshots → use existing Haiku path with JSON string
  const messages: Anthropic.MessageParam[] = screenshots
    ? [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: screenshots.design },
            },
            {
              type: 'text',
              text: 'Design donor website (above) — analyze its visual identity (colors, typography, layout, mood) and apply those design choices to the page you generate.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: screenshots.content },
            },
            {
              type: 'text',
              text: 'Content donor website (above) — extract the text content (headings, paragraphs, navigation items) from this page to populate the generated page.',
            },
          ],
        },
        {
          role: 'user',
          content: JSON.stringify({ designSystem: designSystemPayload, pageContent: pageContentPayload, navigation: navigationPayload, currentSlug: content.slug }),
        },
      ]
    : [
        {
          role: 'user',
          content: JSON.stringify({ designSystem: designSystemPayload, pageContent: pageContentPayload, navigation: navigationPayload, currentSlug: content.slug }),
        },
      ]

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  })

  if (response.stop_reason === 'max_tokens') {
    throw new Error(
      'Output truncated — page too complex for the current token limit. Increase COMPOSER_MAX_TOKENS or use a simpler source site.'
    )
  }

  const block = response.content[0]
  let text = (block?.type === 'text' ? block.text : '').trimStart()

  // Smaller models sometimes wrap output in markdown fences despite instructions
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:html)?\s*\n?/, '').replace(/\n?```\s*$/, '').trimStart()
  }

  if (!/^<!doctype html>/i.test(text)) {
    throw new Error('Claude did not return valid HTML')
  }

  return text
}
