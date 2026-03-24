import { scrapeSite } from '@/lib/scraper'
import { scrapeWithBrowser } from '@/lib/browserScraper'
import { discoverPages } from '@/lib/discover'
import { extractDesignSystem, extractPageContent } from '@/lib/extractor'
import type { DesignSystem, DiscoveredPage, PageContent } from '@/lib/types'

// TODO: share via a constants module
const BYOK_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6']

interface PrepareResult {
  designSystem: DesignSystem
  pages: DiscoveredPage[]
  pageContents: PageContent[]
  warnings: string[]
  model: string
  designScreenshot?: string  // base64 PNG from browser render
  contentScreenshot?: string // base64 PNG from browser render
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const designUrl = searchParams.get('designUrl')
  const contentUrl = searchParams.get('contentUrl')

  if (!designUrl || !contentUrl) {
    return new Response('Missing parameters', { status: 400 })
  }

  const byokKey = request.headers.get('x-api-key')
  const apiKey = byokKey ?? process.env.ANTHROPIC_API_KEY ?? ''

  if (!apiKey) {
    return new Response('Unauthorized', { status: 401 })
  }

  const requestedModel = searchParams.get('model') ?? ''
  const model = byokKey
    ? (BYOK_MODELS.includes(requestedModel) ? requestedModel : 'claude-sonnet-4-6')
    : 'claude-haiku-4-5-20251001'

  const maxPages = parseInt(process.env.DEMO_PAGE_LIMIT ?? '6')
  const warnings: string[] = []

  try {
    let designSite = await scrapeSite(designUrl)
    if (designSite.jsRendered) {
      warnings.push('Detected JS rendering on design site — retrying with browser...')
      designSite = await scrapeWithBrowser(designUrl)
    }

    let contentSite = await scrapeSite(contentUrl)
    if (contentSite.jsRendered) {
      warnings.push('Detected JS rendering on content site — retrying with browser...')
      contentSite = await scrapeWithBrowser(contentUrl)
    }

    const pages = discoverPages(contentSite, maxPages)
    const designSystem = extractDesignSystem(designSite)
    const pageContents = pages.map((page) => extractPageContent(contentSite, page))

    const result: PrepareResult = { designSystem, pages, pageContents, warnings, model, designScreenshot: designSite.screenshot, contentScreenshot: contentSite.screenshot }
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    let message: string
    if (err instanceof Error) {
      message = err.message
    } else {
      try { message = JSON.stringify(err) ?? 'Unknown error' } catch { message = 'Unknown error' }
    }
    return new Response(message, { status: 500 })
  }
}
