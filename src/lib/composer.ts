import Anthropic from '@anthropic-ai/sdk'
import type { DesignSystem, DiscoveredPage, PageContent } from './types'

const RAW_CSS_LIMIT = 2500

const SYSTEM_PROMPT = `You are an expert web developer. Reproduce the visual design of one site using the content of another.

Rules (all mandatory):
1. SELF-CONTAINED: no <link> tags, no @import rules, no external font URLs, no CDN scripts. All CSS in a <style> block. Use system font stacks (e.g. -apple-system, ui-sans-serif, Georgia) unless a font-face is provided inline.
2. CONTENT ONLY: use exclusively the text in pageContent. Never invent statistics, project names, testimonials, or any text not present in the input.
3. DESIGN TOKENS: apply cssVariables, colorPalette, and fontStack faithfully. Mirror the visual hierarchy, spacing feel, and component shapes from componentPatterns.
4. NAVIGATION: render a nav with links to every entry in the navigation array. The currentSlug entry must be visually active/highlighted.
5. Semantic HTML5, polished, and responsive.

Return ONLY the HTML document starting with <!DOCTYPE html>. No explanation, no markdown, no code fences.`

export async function composePage(
  design: DesignSystem,
  content: PageContent,
  allPages: DiscoveredPage[],
  apiKey: string
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
    navigation: allPages.map((p) => ({ slug: p.slug, label: p.navLabel })),
    currentSlug: content.slug,
  })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = response.content[0]
  const text = block?.type === 'text' ? block.text : ''

  if (!/^<!doctype html>/i.test(text.trimStart())) {
    throw new Error('Claude did not return valid HTML')
  }

  return text
}
