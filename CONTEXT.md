# kaminify — Project Context

## What It Does

Paste two URLs — a **design source** and a **content source** — and kaminify's AI pipeline:
1. Scrapes both sites (headless browser for JS-rendered sites)
2. Extracts the visual design system from the design donor
3. Pulls structured content from the content donor
4. Generates a complete multi-page site applying the design of one to the content of the other

Pages appear progressively via SSE streaming. Preview in-browser via sandboxed iframe (blob URL). Download as a self-contained ZIP.

---

## Branch & PR Rules (CRITICAL)

- **NEVER create a PR directly to `main`**. Only to `staging`.
- Flow: `feature branch` → `staging` → `main`
- Exception: only PR to `main` if the **live site is down** (emergency)
- If staging matches main (no new commits), create PR targeting `main` but notify user to merge staging → main themselves after review

## Pre-PR Checklist

1. `npm run lint` — must pass, zero warnings
2. `npm run test` — all 225 tests must pass
3. `npm run typecheck` — fix any new errors (pre-existing stripe/supabase missing-module errors are OK, they are not installed)
4. Commit to feature branch, push, create PR to **staging**
5. Do NOT merge to main — wait for user approval

---

## Architecture

### Pipeline Flow

```
User submits designUrl + contentUrl
  └── GET /api/prepare
        ├── scrapeSite(designUrl)  ──→ detects jsRendered?
        │     └─ true → scrapeWithBrowser() → JPEG screenshot
        ├── scrapeSite(contentUrl) ──→ detects jsRendered?
        │     └─ true → scrapeWithBrowser() → JPEG screenshot
        ├── discoverPages()        ← parses nav links
        ├── extractDesignSystem()  ← CSS variables, colors, fonts, components
        └── returns: designSystem + pages + screenshots + model

  └── POST /api/compose (per page, SSE stream)
        ├── screenshots present → Claude Sonnet + image blocks + JSON
        │     (vision: analyzes colors, typography, mood from screenshots)
        └── no screenshots → Claude Haiku + JSON only
```

### Static vs JS-Rendered Sites

| Site Type | Scraper | Model |
|---|---|---|
| Static HTML | `scrapeSite()` — fetch + cheerio | Haiku (demo) or user-selected |
| JS-Rendered (React/Vue/SPAs) | `scrapeWithBrowser()` — puppeteer + Browserless | Sonnet (auto-upgrade) |

JS detection: body text <500 chars, `div#root/div#__next`, or `<noscript>` hints.

### Screenshots

- Captured via `page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 })`
- Viewport: 512×384 (deviceScaleFactor: 1)
- JPEG at 60% quality → ~40KB base64 (~10k tokens) vs PNG at 1024×768 → ~1MB (~250k tokens)
- `waitUntil: 'networkidle0'` first, fallback to `'load'` + 2s evaluate delay
- Sonnet enforced when screenshots present (Haiku cannot process images)

### Key Files

```
src/
├── app/
│   ├── page.tsx                  ← main UI, SSE client, state management
│   ├── api/
│   │   ├── prepare/route.ts      ← scrape + extract, returns screenshots + model
│   │   └── compose/route.ts       ← per-page generation, SSE streaming
│   └── download/route.ts          ← ZIP generation
├── components/
│   ├── UrlInputPanel.tsx          ← URL inputs, model selector, example pills
│   ├── ProgressFeed.tsx            ← live scrolling event log
│   ├── PagePreview.tsx             ← sandboxed iframe with blob URL
│   └── PageTabBar.tsx             ← tabs per cloned page
└── lib/
    ├── scraper.ts                 ← fetch + cheerio (static sites)
    ├── browserScraper.ts          ← puppeteer (JS-rendered sites)
    ├── extractor.ts                ← extractDesignSystem, extractPageContent
    ├── composer.ts                 ← Claude call, dual-path (vision/text)
    ├── discover.ts                 ← parse nav links → DiscoveredPage[]
    └── types.ts                   ← ScrapedSite, DesignSystem, PageContent, etc.
```

---

## Key Types

```typescript
ScrapedSite {
  url, html, css, title,
  jsRendered: boolean,
  screenshot?: string  // base64 JPEG (60% quality, 512×384)
}

DesignSystem {
  cssVariables, colorPalette, fontStack,
  componentPatterns, rawCss, webFontUrl?,
  headingFontPairs?, backgroundEffects?, shadowValues?,
  componentCss?
}

PageContent {
  slug, title, headings, paragraphs,
  listItems, ctaTexts, imageAlts, metaDescription
}
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Server-side key for demo + signed-in free runs |
| `BROWSERLESS_WS_URL` | No | Browserless WebSocket URL (headless Chrome for JS sites) |
| `DEMO_RUN_LIMIT` | No | Max runs per session (default: 3) |
| `DEMO_PAGE_LIMIT` | No | Max pages per run (default: 3) |
| `NEXT_PUBLIC_DEMO_RUN_LIMIT` | No | Client-visible limit |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk dev/public key |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Yes | Clerk sign-in redirect |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Yes | Clerk sign-up redirect |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Yes | Post-sign-in redirect |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Yes | Post-sign-up redirect |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only, never client) |
| `API_KEY_KEK` | Yes | 64-char hex key for AES-256-GCM API key encryption. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SENTRY_DSN` | No | Sentry DSN for error tracking |

---

## Commands

```bash
npm run dev        # localhost:3000
npm run build      # production build
npm run lint       # ESLint
npm run test       # Vitest (all 225 tests)
npm run typecheck  # tsc --noEmit
```

---

## Vercel Config

`vercel.json` sets `maxDuration: 60` for `prepare` and `compose` routes. The hobby plan ceiling is 60s; the split pipeline ensures each individual call fits within that window.

---

## Current State (as of March 2026)

- Phase 2 auth complete: Clerk + Supabase, server-enforced quotas, BYOK key persistence
- AES-256-GCM API key encryption at rest (KEK from `API_KEY_KEK` env var)
- Vision pipeline shipped: screenshots → Claude Sonnet with image blocks → pages with genuine visual DNA
- Dual-path composer: Sonnet+vision for JS sites, Haiku+text for static sites
- Model auto-upgrade badge in UI: shows "Sonnet" when server resolves from Haiku
- All 225 tests passing, lint clean, build passing
- **Beta ready** — README rewritten, `LANDING_PAGE_CONTEXT.md` written for landing page update

---

## Known Pre-existing Issues

- `src/lib/stripe.ts` and `src/lib/supabase.ts` have missing module errors (`stripe`, `@supabase/supabase-js` not installed) — these are intentional stubs, not blocking
- `npm run typecheck` will report these two files — do not try to fix them
