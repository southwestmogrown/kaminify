import Anthropic from '@anthropic-ai/sdk'
import type { DesignSystem, DiscoveredPage, PageContent } from './types'

const RAW_CSS_LIMIT = 8000

const SYSTEM_PROMPT = `You are an expert web developer. Given a design system and page content, build a polished, complete, self-contained HTML page.

Hard constraints:
- Output ONLY the HTML document starting with <!DOCTYPE html>. No markdown, no code fences, no explanation.
- Fully self-contained: all CSS in a <style> block, no external stylesheets, no CDN links, no @import. Use system font stacks unless a web font is critical to the design.
- Use only the text provided in pageContent — do not invent copy, statistics, or names.
- Include navigation linking all pages; use the href field from each navigation entry as the anchor href attribute; mark currentSlug as active.
- Do not apply decorative li::before or li::after pseudo-elements as a global rule — scope them to specific named component classes only.

Apply the design tokens, color palette, component patterns, and layout feel from the design system faithfully. Make it responsive and production-quality. Write efficient, minimal CSS — avoid redundancy. The complete page must fit in a single response.`

export async function composePage(
  design: DesignSystem,
  content: PageContent,
  allPages: DiscoveredPage[],
  apiKey: string,
  model: string
): Promise<string> {
  const client = new Anthropic({ apiKey })

  // Strip :root blocks (already in cssVariables) then take first RAW_CSS_LIMIT chars of rules
  const rawCssSnippet = design.rawCss
    .replace(/:root\s*\{[^}]*\}/g, '')
    .slice(0, RAW_CSS_LIMIT)

  const userMessage = JSON.stringify({
    designSystem: {
      cssVariables: design.cssVariables,
      colorPalette: design.colorPalette,
      fontStack: design.fontStack,
      componentPatterns: design.componentPatterns,
      rawCss: rawCssSnippet,
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
