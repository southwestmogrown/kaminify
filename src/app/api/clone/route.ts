import { scrapeSite } from '@/lib/scraper'
import { discoverPages } from '@/lib/discover'
import { extractDesignSystem, extractPageContent } from '@/lib/extractor'
import { composePage } from '@/lib/composer'
import type { CloneEvent, ClonedPage } from '@/lib/types'

const encoder = new TextEncoder()

function send(controller: ReadableStreamDefaultController, event: CloneEvent) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const designUrl = searchParams.get('designUrl')
  const contentUrl = searchParams.get('contentUrl')

  if (!designUrl || !contentUrl) {
    return new Response('Missing parameters', { status: 400 })
  }

  const apiKey =
    request.headers.get('x-api-key') ?? process.env.ANTHROPIC_API_KEY ?? ''

  if (!apiKey) {
    return new Response('Unauthorized', { status: 401 })
  }

  const maxPages = parseInt(process.env.DEMO_PAGE_LIMIT ?? '6')

  const stream = new ReadableStream({
    async start(controller) {
      try {
        send(controller, { type: 'status', message: 'Scraping design site...' })
        const designSite = await scrapeSite(designUrl)

        send(controller, { type: 'status', message: 'Scraping content site...' })
        const contentSite = await scrapeSite(contentUrl)

        send(controller, { type: 'status', message: 'Discovering pages...' })
        const pages = discoverPages(contentSite, maxPages)

        send(controller, { type: 'status', message: `Found ${pages.length} page(s)` })
        const designSystem = extractDesignSystem(designSite)

        for (const page of pages) {
          send(controller, { type: 'status', message: `Scraping ${page.navLabel}...` })
          const pageSite = await scrapeSite(page.url)
          send(controller, { type: 'status', message: `Generating ${page.navLabel}...` })
          const content = extractPageContent(pageSite, page)
          const html = await composePage(designSystem, content, pages, apiKey)
          const clonedPage: ClonedPage = {
            slug: page.slug,
            title: page.title,
            navLabel: page.navLabel,
            html,
            generatedAt: new Date().toISOString(),
          }
          send(controller, { type: 'page_complete', page: clonedPage })
        }

        send(controller, { type: 'done' })
      } catch (err) {
        send(controller, { type: 'error', error: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
