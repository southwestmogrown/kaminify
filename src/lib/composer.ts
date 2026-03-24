import Anthropic from '@anthropic-ai/sdk'
import type { DesignSystem, DiscoveredPage, PageContent } from './types'

// Extract all :root { --var: value; } blocks from CSS as a single string.
// These are prepended to rawCss so design-site variables take cascade priority
// over any content-site variables that share the same names.
function buildCssVariableOverrides(cssVariables: string, colorPalette: string[]): string {
  const vars = cssVariables.trim()
  if (!vars && colorPalette.length === 0) return ''
  const parts: string[] = []
  if (vars) parts.push(`:root { ${vars} }`)
  return parts.join('\n') + '\n'
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

export async function composePage(
  design: DesignSystem,
  content: PageContent,
  allPages: DiscoveredPage[],
  apiKey: string,
  model: string
): Promise<string> {
  const client = new Anthropic({ apiKey })

  // Full rawCss is passed — no truncation. Design-site CSS variables are prepended
  // so they take cascade priority over any content-site variables that share names.
  const cssOverrides = buildCssVariableOverrides(design.cssVariables, design.colorPalette)
  const rawCssSnippet = cssOverrides + design.rawCss

  const userMessage = JSON.stringify({
    designSystem: {
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
    },
    pageContent: {
      title: content.title,
      headings: content.headings,
      paragraphs: content.paragraphs,
      listItems: content.listItems,
      ctaTexts: content.ctaTexts,
      imageAlts: content.imageAlts,
      metaDescription: content.metaDescription,
    },
    navigation: allPages.map((p) => ({ slug: p.slug, label: p.navLabel, href: `${p.slug}.html` })),
    currentSlug: content.slug,
  })

  const maxTokens = (() => {
    const val = parseInt(process.env.COMPOSER_MAX_TOKENS ?? '8192', 10)
    return Number.isNaN(val) ? 8192 : val
  })()

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
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
