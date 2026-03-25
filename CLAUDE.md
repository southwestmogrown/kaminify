# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project

**kaminify** — paste two URLs (a design source and a content source), and the pipeline scrapes both, extracts the visual design system from the first, and uses Claude to generate a cloned multi-page site applying that design to the other's content. Preview pages live, download as ZIP.

**Live at** [app.kaminify.com](https://app.kaminify.com)

## Stack

- Next.js 15 (App Router, TypeScript)
- Tailwind CSS v4
- Anthropic SDK (`@anthropic-ai/sdk`) — Haiku 4.5, Sonnet 4.6, Opus 4.6
- puppeteer-core + Browserless (headless Chrome for JS-rendered sites)
- cheerio (server-side HTML parsing)
- archiver (ZIP generation)
- Clerk (auth) + Supabase (Postgres + RLS)
- Sentry (error tracking)
- Deployed on Vercel

## Commands

```bash
npm run dev          # start dev server on localhost:3000
npm run build        # production build
npm run lint         # ESLint — must pass before PR
npm run test         # Vitest — 230 tests, all must pass before PR
npm run typecheck    # tsc --noEmit — fix new errors (pre-existing stripe/supabase stub errors OK)
```

## Branch & PR Rules

- **NEVER force-push to `main`**
- **NEVER create a PR directly to `main`** — only to `staging`
- Flow: `feature branch` → PR to `staging` → PR to `main`
- Exception: PR to `main` only if the live site is down (emergency)
- Before any PR: lint, test, typecheck, code review via `skills/SKILL_code-review.md`

## Architecture

### Pipeline flow

```
User submits designUrl + contentUrl
  └── GET /api/prepare
        ├── scrapeSite(designUrl)   ← cheerio or puppeteer + screenshot
        ├── scrapeSite(contentUrl)  ← cheerio or puppeteer + screenshot
        ├── discoverPages()         ← parses nav links (max 6 pages)
        ├── extractDesignSystem()   ← CSS vars, colors, fonts, components
        └── returns: designSystem + pages + screenshots + model

  └── POST /api/compose (per page, SSE stream)
        ├── screenshots → Claude Sonnet + image blocks (vision)
        └── no screenshots → Claude Haiku + text-only JSON
        └── emit { type: "page_complete", page }
```

### Static vs JS-rendered sites

| Site Type | Scraper | Model |
|---|---|---|
| Static HTML | `scrapeSite()` — fetch + cheerio | Haiku (demo) or user-selected |
| JS-rendered (React/Vue/SPAs) | `scrapeWithBrowser()` — puppeteer + Browserless | Sonnet (auto, mandatory) |

JS detection: body text <500 chars, `div#root`/`div#__next`, or `<noscript>` hints. Screenshots captured as JPEG/60 at 512x384.

### Key design decisions

- **Split pipeline** — `/api/prepare` + `/api/compose` fit within Vercel's 60s maxDuration. Client orchestrates the page loop.
- **SSE streaming** — `/api/compose` returns `text/event-stream`. Each event is `data: <JSON>\n\n`.
- **Blob URL iframes** — cloned HTML never stored server-side for preview; client creates `URL.createObjectURL(new Blob([html]))`.
- **Model auto-upgrade** — Sonnet mandatory when screenshots present (Haiku cannot process images).
- **CSS truncation** — raw CSS capped before passing to Claude to avoid context overflow.

### Auth model

| Tier | Runs | Model | Key |
|---|---|---|---|
| Anonymous | 3/session | Haiku | Server key |
| Signed-in (free) | 3/month | Haiku | Server key |
| Signed-in + BYOK | Unlimited | User-selectable | AES-256-GCM encrypted at rest |

API keys encrypted with AES-256-GCM. DB stores `{ciphertext, iv, authTag}` JSON — plaintext never persisted.

### Folder structure

```
src/
├── app/
│   ├── page.tsx                      ← main UI, state management, SSE client
│   ├── layout.tsx                    ← root layout with Clerk provider
│   ├── globals.css
│   ├── privacy/page.tsx              ← privacy policy
│   ├── sign-in/[[...sign-up]]/       ← Clerk auth pages
│   ├── sign-up/[[...sign-up]]/
│   └── api/
│       ├── prepare/route.ts          ← scrape + extract + JS detection
│       ├── compose/route.ts          ← per-page Claude generation (SSE)
│       ├── download/route.ts         ← ZIP generation
│       ├── me/route.ts               ← GET user quota + decrypted API key
│       ├── me/api-key/route.ts       ← POST/DELETE BYOK key management
│       ├── me/claim-anonymous-runs/  ← migrate anonymous runs on sign-in
│       ├── sites/route.ts            ← GET list sites
│       ├── sites/[id]/route.ts       ← GET/PATCH/DELETE individual site
│       ├── sites/[id]/regenerate/    ← POST regenerate from saved site
│       └── runs/[id]/consent/        ← PATCH training consent toggle
├── components/
│   ├── UrlInputPanel.tsx             ← URL inputs, model selector, example pills
│   ├── PageTabBar.tsx                ← tabs per cloned page
│   ├── PagePreview.tsx               ← sandboxed iframe with blob URL
│   ├── ProgressFeed.tsx              ← live scrolling event log
│   ├── DemoBanner.tsx                ← runs remaining, tier display, BYOK CTA
│   ├── ApiKeyInput.tsx               ← BYOK key modal
│   └── GeneratingAnimation.tsx       ← loading animation
├── lib/
│   ├── types.ts                      ← all shared interfaces
│   ├── scraper.ts                    ← fetch + cheerio (static sites)
│   ├── browserScraper.ts             ← puppeteer + Browserless (JS sites)
│   ├── extractor.ts                  ← extractDesignSystem, extractPageContent
│   ├── composer.ts                   ← Claude call, dual-path vision/text
│   ├── discover.ts                   ← parse nav links → DiscoveredPage[]
│   ├── demo.ts                       ← demo session logic (sessionStorage)
│   ├── session.ts                    ← anonymous session ID management
│   ├── auth.ts                       ← Clerk JWT verification
│   ├── quota.ts                      ← run quota enforcement
│   ├── site-storage.ts               ← Supabase CRUD for sites/runs/pages
│   ├── api-key-crypto.ts             ← AES-256-GCM encrypt/decrypt
│   ├── supabase.ts                   ← Supabase client
│   └── stripe.ts                     ← stub (not yet implemented)
├── middleware.ts                     ← Clerk auth middleware
└── skills/                           ← agent workflow definitions
    ├── SKILL_code-review.md
    ├── SKILL_bug-fix.md
    ├── SKILL_design-cloning.md
    ├── SKILL_mini-coder-max.md
    └── SKILL_ui-ux-designer.md
```

### Core types (`lib/types.ts`)

`ScrapedSite` → `DesignSystem` / `PageContent` → `ClonedPage` → `CloneResult`

SSE events: `CloneEvent` with `type: "status" | "progress" | "warning" | "page_complete" | "error" | "done"`

DB types: `Site`, `Run`, `RunPageInput`, `RunPageOutput`, `UserRecord`, `QuotaStatus`

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Server key for demo + free-tier runs |
| `BROWSERLESS_WS_URL` | No | Browserless WebSocket URL for JS-rendered sites |
| `DEMO_RUN_LIMIT` | No | Max runs/session for anonymous users (default: 3) |
| `DEMO_PAGE_LIMIT` | No | Max pages/run for demo users (default: 3) |
| `NEXT_PUBLIC_DEMO_RUN_LIMIT` | No | Client-visible demo limit (default: 3) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk public key |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Yes | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Yes | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Yes | `/` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Yes | `/` |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only) |
| `API_KEY_KEK` | Yes | 64-char hex for AES-256-GCM. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SENTRY_DSN` | No | Sentry error tracking |

## Deployment

- **App:** `app.kaminify.com` (this repo, Vercel)
- **Landing:** `kaminify.com` (separate `kaminify-landing` repo)
- **Auth:** `clerk.kaminify.com`
- `vercel.json` sets `maxDuration: 60` for `prepare` and `compose` routes (Hobby plan ceiling)

## Current state (March 2026)

- Phase 2 complete: Clerk auth, Supabase DB, server-enforced quotas, BYOK encryption, vision pipeline, site storage + training consent
- 230 tests passing, lint clean, build passing
- **Not yet built:** Stripe billing, usage dashboard, design token editor, template library, one-click deploy
- See open GitHub issues for the full roadmap (M5–M8)

## Known pre-existing issues

- `src/lib/stripe.ts` has a missing-module error (`stripe` not installed) — intentional stub for future billing
- `npm run typecheck` reports this — do not try to fix it
