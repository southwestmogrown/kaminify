import { auth } from '@clerk/nextjs/server'
import { composePage } from '@/lib/composer'
import { adminClient } from '@/lib/supabase'
import { deserialiseEncryptedKey, decryptApiKey } from '@/lib/api-key-crypto'
import { logComposePage, logRunError } from '@/lib/site-storage'
import type { CloneEvent, ClonedPage, DesignSystem, DiscoveredPage, PageContent } from '@/lib/types'

const encoder = new TextEncoder()

const BYOK_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6']

function send(controller: ReadableStreamDefaultController, event: CloneEvent) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
}

interface ComposeBody {
  designSystem: DesignSystem
  pageContent: PageContent
  allPages: DiscoveredPage[]
  model?: string
  screenshots?: {
    design: string
    content: string
  }
  siteId?: string
  runId?: string
}

export async function POST(request: Request): Promise<Response> {
  const byokHeader = request.headers.get('x-api-key')
  const authHeader = request.headers.get('authorization')

  let effectiveApiKey = ''
  let signedInUserId: string | null = null

  if (byokHeader) {
    // BYOK mode — user's own key takes precedence
    effectiveApiKey = byokHeader
  } else if (authHeader?.startsWith('Bearer ')) {
    // Signed-in user — use their stored api_key if available, otherwise server env key
    const { userId } = await auth()
    signedInUserId = userId

    if (signedInUserId) {
      const { data: user } = await adminClient()
        .from('users')
        .select('api_key')
        .eq('clerk_user_id', signedInUserId)
        .single()

      if (user?.api_key) {
        try {
          const encrypted = deserialiseEncryptedKey(user.api_key)
          effectiveApiKey = decryptApiKey(encrypted)
        } catch {
          // Decryption failed — key was encrypted with a different KEK or is corrupt; fall through to env key
          effectiveApiKey = process.env.ANTHROPIC_API_KEY ?? ''
        }
      } else {
        effectiveApiKey = process.env.ANTHROPIC_API_KEY ?? ''
      }
    } else {
      // Invalid Clerk token — fall through to server key check below
    }
  }

  // Fallback: use server-side env key (demo mode — no auth required)
  if (!effectiveApiKey) {
    effectiveApiKey = process.env.ANTHROPIC_API_KEY ?? ''
  }

  if (!effectiveApiKey) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: ComposeBody
  try {
    body = await request.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const { designSystem, pageContent, allPages, model: requestedModel, screenshots, runId } = body

  if (!designSystem || !pageContent || !Array.isArray(allPages)) {
    return new Response('Bad Request', { status: 400 })
  }

  // If screenshots are provided, enforce Sonnet (Haiku can't read images)
  // BYOK/signed-in users can request Sonnet; demo mode uses Haiku
  const model = screenshots
    ? 'claude-sonnet-4-6'
    : effectiveApiKey && (byokHeader || signedInUserId)
      ? (BYOK_MODELS.includes(requestedModel ?? '') ? requestedModel! : 'claude-sonnet-4-6')
      : 'claude-haiku-4-5-20251001'

  const navLabel = allPages.find((p) => p.slug === pageContent.slug)?.navLabel || pageContent.title || pageContent.slug

  const navigation: Array<{ slug: string; label: string; href: string }> = allPages.map((p) => ({
    slug: p.slug,
    label: p.navLabel,
    href: `${p.slug}.html`,
  }))

  const stream = new ReadableStream({
    async start(controller) {
      send(controller, { type: 'status', message: `Generating ${navLabel}...` })

      const start = Date.now()
      const tick = setInterval(() => {
        const s = Math.round((Date.now() - start) / 1000)
        send(controller, { type: 'progress', message: `Generating ${navLabel}... ${s}s` })
      }, 2000)

      try {
        const html = await composePage(designSystem, pageContent, allPages, effectiveApiKey, model, screenshots)
        clearInterval(tick)
        const clonedPage: ClonedPage = {
          slug: pageContent.slug,
          title: pageContent.title,
          navLabel,
          html,
          generatedAt: new Date().toISOString(),
        }
        send(controller, { type: 'page_complete', page: clonedPage })

        // Log the page output to DB — non-blocking
        if (runId) {
          logComposePage({
            runId,
            pageSlug: pageContent.slug,
            pageTitle: pageContent.title,
            navLabel,
            designSystem,
            pageContent,
            navigation,
            generatedHtml: html,
            promptTokens: null,   // composePage doesn't return token counts
            completionTokens: null,
            modelUsed: model,
          }).catch((logErr) => {
            console.error('Failed to log compose page:', logErr)
          })
        }
      } catch (err) {
        clearInterval(tick)
        let message: string
        if (err instanceof Error) {
          message = err.message
        } else {
          try { message = JSON.stringify(err) ?? 'Unknown error' } catch { message = 'Unknown error' }
        }
        send(controller, { type: 'error', error: message })

        // Log the error to the run
        if (runId) {
          logRunError(runId, message).catch((logErr) => {
            console.error('Failed to log run error:', logErr)
          })
        }
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
