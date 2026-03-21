import Anthropic from '@anthropic-ai/sdk'
import type { DesignSystem, DiscoveredPage, PageContent } from './types'

const CSS_CHAR_LIMIT = 8000

const SYSTEM_PROMPT = `You are an expert web developer. You will be given a design system extracted
from one website and content extracted from another. Your job is to produce
a complete, self-contained HTML page that:

1. Uses the visual design (colors, fonts, spacing, component patterns) from the design system
2. Fills that design with the provided content
3. Includes a working navigation linking to all provided pages
4. Is entirely self-contained — all CSS must be inline or in a <style> tag, no external dependencies
5. Looks polished and professional
6. Uses semantic HTML5 elements

Return ONLY the complete HTML document starting with <!DOCTYPE html>.
No explanation, no markdown, no code fences.`

export async function composePage(
  design: DesignSystem,
  content: PageContent,
  allPages: DiscoveredPage[],
  apiKey: string
): Promise<string> {
  const client = new Anthropic({ apiKey })

  const userMessage = JSON.stringify({
    designSystem: {
      colorPalette: design.colorPalette,
      fontStack: design.fontStack,
      spacing: design.spacing,
      borderRadius: design.borderRadius,
      componentPatterns: design.componentPatterns,
      rawCss: design.rawCss.slice(0, CSS_CHAR_LIMIT),
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
