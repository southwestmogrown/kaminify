import { auth } from '@clerk/nextjs/server'
import { scrapeSite } from '@/lib/scraper'
import { scrapeWithBrowser } from '@/lib/browserScraper'
import { discoverPages } from '@/lib/discover'
import { extractDesignSystem, extractPageContent } from '@/lib/extractor'
import { getQuotaStatus, incrementRun } from '@/lib/quota'
import { adminClient } from '@/lib/supabase'
import { logPrepareRun } from '@/lib/site-storage'
import { deserialiseEncryptedKey, decryptApiKey } from '@/lib/api-key-crypto'
import type { DesignSystem, DiscoveredPage, PageContent } from '@/lib/types'
import { checkRateLimit, getRateLimitId } from '@/lib/rateLimit'

const BYOK_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6']

interface PrepareResult {
  designSystem: DesignSystem
  pages: DiscoveredPage[]
  pageContents: PageContent[]
  warnings: string[]
  model: string
  designScreenshot?: string
  contentScreenshot?: string
  userApiKey?: string   // returned so page.tsx can pass it to compose calls
  siteId?: string
  runId?: string
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const designUrl = searchParams.get('designUrl')
  const contentUrl = searchParams.get('contentUrl')
  const sessionId = searchParams.get('sessionId')

  if (!designUrl || !contentUrl) {
    return new Response('Missing parameters', { status: 400 })
  }

  // --- Auth resolution ---
  // Priority: 1) Clerk JWT (signed-in user), 2) x-api-key header (BYOK), 3) server key (demo)
  const authHeader = request.headers.get('authorization')
  const byokHeader = request.headers.get('x-api-key')

  let signedInUserId: string | null = null
  let isByok = false  // true when the user is running with their own key (explicit or stored)
  let effectiveApiKey = ''
  let userApiKeyToReturn: string | undefined = undefined

  if (authHeader?.startsWith('Bearer ')) {
    // Signed-in user — verify Clerk JWT
    const { userId } = await auth()
    signedInUserId = userId

    if (signedInUserId) {
      // Fetch the user's stored BYOK key FIRST so we know if they get unlimited runs
      const { data: user } = await adminClient()
        .from('users')
        .select('api_key')
        .eq('clerk_user_id', signedInUserId)
        .single()

      if (user?.api_key) {
        // Decrypt the stored BYOK key — the DB only holds ciphertext
        let decryptedKey: string | null = null
        try {
          const encrypted = deserialiseEncryptedKey(user.api_key)
          decryptedKey = decryptApiKey(encrypted)
        } catch {
          // Corrupt key — treat as no key, fall through to quota check
        }
        if (decryptedKey) {
          effectiveApiKey = decryptedKey
          userApiKeyToReturn = decryptedKey
          isByok = true
        } else {
          // Decryption failed — fall through to quota check
          const quota = await getQuotaStatus(signedInUserId)
          if (!quota.canRun) {
            return new Response(
              JSON.stringify({ error: 'Run limit reached. Add your own API key to continue.' }),
              { status: 403, headers: { 'Content-Type': 'application/json' } },
            )
          }
          effectiveApiKey = process.env.ANTHROPIC_API_KEY ?? ''
        }
      } else {
        // No BYOK key — check monthly quota
        const quota = await getQuotaStatus(signedInUserId)
        if (!quota.canRun) {
          return new Response(
            JSON.stringify({ error: 'Run limit reached. Add your own API key to continue.' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          )
        }
        effectiveApiKey = process.env.ANTHROPIC_API_KEY ?? ''
      }
    } else {
      // Token provided but user not found — treat as unauthenticated
      return new Response(JSON.stringify({ error: 'Invalid authentication token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } else if (byokHeader) {
    // BYOK mode — user's own explicit key
    effectiveApiKey = byokHeader
    isByok = true
  } else {
    // Server-side demo key (no auth)
    effectiveApiKey = process.env.ANTHROPIC_API_KEY ?? ''
  }

  if (!effectiveApiKey) {
    return new Response(JSON.stringify({ error: 'No API key available' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { limited, retryAfter } = await checkRateLimit(getRateLimitId(request, signedInUserId))
  if (limited) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    })
  }

  const requestedModel = searchParams.get('model') ?? ''
  const model = isByok
    ? (BYOK_MODELS.includes(requestedModel) ? requestedModel : 'claude-sonnet-4-6')
    : 'claude-haiku-4-5-20251001'

  const maxPages = parseInt(process.env.DEMO_PAGE_LIMIT ?? '6')
  const warnings: string[] = []

  try {
    let designSite = await scrapeSite(designUrl)
    // Capture jsRendered flag BEFORE browser retry (after retry, the flag may be stale)
    const jsRenderedDesign = !!designSite.jsRendered
    if (designSite.jsRendered) {
      warnings.push('Detected JS rendering on design site — retrying with browser...')
      designSite = await scrapeWithBrowser(designUrl)
    }

    let contentSite = await scrapeSite(contentUrl)
    const jsRenderedContent = !!contentSite.jsRendered
    if (contentSite.jsRendered) {
      warnings.push('Detected JS rendering on content site — retrying with browser...')
      contentSite = await scrapeWithBrowser(contentUrl)
    }

    const pages = discoverPages(contentSite, maxPages)
    const designSystem = extractDesignSystem(designSite)
    const pageContents = pages.map((page) => extractPageContent(contentSite, page))

    // Increment run count for signed-in user after successful prepare
    if (signedInUserId) {
      await incrementRun(signedInUserId).catch((err) => {
        console.error('Failed to increment run count:', err)
      })
    }

    // Log the prepare run to DB (site + run + page_inputs) — non-blocking
    let siteId: string | undefined
    let runId: string | undefined
    try {
      const logResult = await logPrepareRun({
        userId: signedInUserId,
        sessionId: sessionId ?? null,
        designUrl,
        contentUrl,
        model,
        pages,
        designSystem: { ...designSystem, jsRendered: jsRenderedDesign },
        pageContents,
        jsRenderedDesign,
        jsRenderedContent,
      })
      siteId = logResult.siteId
      runId = logResult.runId
    } catch (logErr) {
      // Non-fatal — logging failures should not block the pipeline
      console.error('Failed to log prepare run:', logErr)
    }

    const result: PrepareResult = {
      designSystem,
      pages,
      pageContents,
      warnings,
      model,
      designScreenshot: designSite.screenshot,
      contentScreenshot: contentSite.screenshot,
      userApiKey: userApiKeyToReturn,
      siteId,
      runId,
    }

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
