/**
 * Shared mock factories for kaminify tests.
 *
 * Centralizes the most commonly duplicated mock setups so individual test
 * files can import ready-made helpers instead of copy-pasting boilerplate.
 */

import { vi } from 'vitest'
import type {
  DesignSystem,
  DiscoveredPage,
  PageContent,
  ScrapedSite,
  ClonedPage,
  UserRecord,
} from '@/lib/types'

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/** Create a minimal mock `Response`. */
export function makeResponse(body: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  } as unknown as Response
}

// ---------------------------------------------------------------------------
// Domain object factories
// ---------------------------------------------------------------------------

export function makeSite(
  html = '<html><body></body></html>',
  css = '',
  url = 'https://example.com',
): ScrapedSite {
  return { url, html, css, title: 'Test Page', jsRendered: false }
}

export function makePage(overrides: Partial<DiscoveredPage> = {}): DiscoveredPage {
  return {
    url: 'https://example.com/about',
    title: 'About',
    slug: 'about',
    navLabel: 'About',
    ...overrides,
  }
}

export function makeDesign(rawCss = 'body { color: red; }'): DesignSystem {
  return {
    cssVariables: '',
    colorPalette: ['#ff0000'],
    fontStack: ['Arial'],
    spacing: ['8px'],
    borderRadius: ['4px'],
    componentPatterns: { nav: '<nav/>', hero: '', footer: '', card: '', button: '' },
    rawCss,
  }
}

export function makeContent(overrides: Partial<PageContent> = {}): PageContent {
  return {
    url: 'https://example.com/about',
    title: 'About',
    slug: 'about',
    headings: ['About Us'],
    paragraphs: ['We build great things.'],
    listItems: [],
    ctaTexts: ['Learn more'],
    imageAlts: [],
    metaDescription: 'About page',
    ...overrides,
  }
}

export function makePages(): DiscoveredPage[] {
  return [
    { url: 'https://example.com/', title: 'Home', slug: 'index', navLabel: 'Home' },
    { url: 'https://example.com/about', title: 'About', slug: 'about', navLabel: 'About' },
  ]
}

export function makeClonedPage(overrides: Partial<ClonedPage> = {}): ClonedPage {
  return {
    slug: 'index',
    title: 'Home',
    navLabel: 'Home',
    html: '<!DOCTYPE html><html><body>Hello</body></html>',
    generatedAt: new Date().toISOString(),
    ...overrides,
  }
}

/** Returns YYYY-MM-01 for the current UTC month. */
export function currentMonthStart(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function makeUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  const monthStart = currentMonthStart()
  return {
    id: 'uuid-1',
    clerk_user_id: 'user_abc',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: 'free',
    runs_this_month: 0,
    month_start: monthStart,
    created_at: `${monthStart}T00:00:00Z`,
    updated_at: `${monthStart}T00:00:00Z`,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Supabase mock builder
// ---------------------------------------------------------------------------

export function makeSupabaseMock(
  userRecord: UserRecord,
  rpcError: { message: string } | null = null,
) {
  const fetchSingle = vi.fn().mockResolvedValue({ data: userRecord, error: null })
  const updateSingle = vi.fn().mockResolvedValue({
    data: { ...userRecord, runs_this_month: 0, month_start: currentMonthStart() },
    error: null,
  })

  let inUpdate = false

  const builder = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => (inUpdate ? updateSingle() : fetchSingle())),
    update: vi.fn().mockImplementation(() => {
      inUpdate = true
      return builder
    }),
  }

  const rpc = vi.fn().mockResolvedValue({ error: rpcError })

  const db = {
    from: vi.fn().mockReturnValue(builder),
    rpc,
  }

  return { db, builder, fetchSingle, updateSingle, rpc }
}

// ---------------------------------------------------------------------------
// Anthropic mock
// ---------------------------------------------------------------------------

export function makeAnthropicResponse(text: string, stopReason = 'end_turn') {
  return {
    content: [{ type: 'text', text }],
    stop_reason: stopReason,
  }
}

// ---------------------------------------------------------------------------
// Puppeteer mock page factory
// ---------------------------------------------------------------------------

export function makePuppeteerPage(overrides: Record<string, unknown> = {}) {
  return {
    setUserAgent: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    content: vi.fn().mockResolvedValue('<html></html>'),
    close: vi.fn().mockResolvedValue(undefined),
    setViewport: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

export function makePuppeteerBrowser(page = makePuppeteerPage()) {
  return {
    newPage: vi.fn().mockResolvedValue(page),
    disconnect: vi.fn().mockResolvedValue(undefined),
  }
}
