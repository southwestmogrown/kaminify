import { composePage } from '@/lib/composer'
import type { CloneEvent, ClonedPage, DesignSystem, DiscoveredPage, PageContent } from '@/lib/types'

const encoder = new TextEncoder()

// TODO: share via a constants module
const BYOK_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6']

function send(controller: ReadableStreamDefaultController, event: CloneEvent) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
}

interface ComposeBody {
  designSystem: DesignSystem
  pageContent: PageContent
  allPages: DiscoveredPage[]
  model?: string
}

export async function POST(request: Request): Promise<Response> {
  const byokKey = request.headers.get('x-api-key')
  const apiKey = byokKey ?? process.env.ANTHROPIC_API_KEY ?? ''

  if (!apiKey) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: ComposeBody
  try {
    body = await request.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const { designSystem, pageContent, allPages, model: requestedModel } = body

  if (!designSystem || !pageContent || !Array.isArray(allPages)) {
    return new Response('Bad Request', { status: 400 })
  }

  const model = byokKey
    ? (BYOK_MODELS.includes(requestedModel ?? '') ? requestedModel! : 'claude-sonnet-4-6')
    : 'claude-haiku-4-5-20251001'

  const navLabel = allPages.find((p) => p.slug === pageContent.slug)?.navLabel || pageContent.title || pageContent.slug

  const stream = new ReadableStream({
    async start(controller) {
      send(controller, { type: 'status', message: `Generating ${navLabel}...` })

      const start = Date.now()
      const tick = setInterval(() => {
        const s = Math.round((Date.now() - start) / 1000)
        send(controller, { type: 'progress', message: `Generating ${navLabel}... ${s}s` })
      }, 2000)

      try {
        const html = await composePage(designSystem, pageContent, allPages, apiKey, model)
        clearInterval(tick)
        const clonedPage: ClonedPage = {
          slug: pageContent.slug,
          title: pageContent.title,
          navLabel,
          html,
          generatedAt: new Date().toISOString(),
        }
        send(controller, { type: 'page_complete', page: clonedPage })
      } catch (err) {
        clearInterval(tick)
        let message: string
        if (err instanceof Error) {
          message = err.message
        } else {
          try { message = JSON.stringify(err) ?? 'Unknown error' } catch { message = 'Unknown error' }
        }
        send(controller, { type: 'error', error: message })
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
