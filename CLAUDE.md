# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**kaminify** (a.k.a. `site-clone-studio`) — paste two URLs (a design source and a content source), and the pipeline scrapes both, then uses Claude to generate a cloned multi-page site applying the design system of one to the content of the other. Preview pages live, download as ZIP.

## Stack

- Next.js 15 (App Router, TypeScript)
- Tailwind CSS v4
- Anthropic SDK (`@anthropic-ai/sdk`)
- `cheerio` for server-side HTML parsing
- `archiver` for ZIP generation
- Deployed on Vercel

## Commands

```bash
npm run dev        # start dev server on localhost:3000
npm run build      # production build
npm run lint       # ESLint
```

## Architecture

### Pipeline flow

```
User submits URLs
  → GET /api/clone?designUrl=X&contentUrl=Y  (SSE stream)
      → scrapeSite(designUrl)        lib/scraper.ts
      → scrapeSite(contentUrl)       lib/scraper.ts
      → discoverPages(contentSite)   lib/discover.ts
      → extractDesignSystem(design)  lib/extractor.ts
      → for each page:
          extractPageContent(page)   lib/extractor.ts
          composePage(design, content, pages, apiKey)  lib/composer.ts  ← Claude call
          send "page_complete" SSE event
      → send "done" SSE event
```

### Key design decisions

- **SSE streaming** — `/api/clone` is a `ReadableStream` returning `Content-Type: text/event-stream`. Each event is `data: <JSON>\n\n`. The client uses the browser's `EventSource` API.
- **Iframe rendering via blob URLs** — cloned HTML is never stored server-side; the client creates `URL.createObjectURL(new Blob([html], { type: "text/html" }))` and sets that as the iframe `src`. Revoke on page change/unmount.
- **CSS truncation** — raw CSS from the design site is capped at 8000 chars before passing to Claude to avoid context overflow.
- **Auth model** — demo mode (3 runs/session, max 3 pages, server-side `ANTHROPIC_API_KEY`); BYOK mode (user's key in `sessionStorage`, passed as a request header, unlimited).

### Folder structure

```
src/
├── app/
│   ├── api/
│   │   ├── clone/route.ts       ← SSE streaming pipeline endpoint
│   │   └── download/route.ts    ← ZIP generation (POST {pages})
│   ├── layout.tsx
│   ├── page.tsx                 ← main UI, state management, SSE client
│   └── globals.css
├── components/
│   ├── UrlInputPanel.tsx        ← two URL inputs + run button + example pills
│   ├── PageTabBar.tsx           ← tabs per cloned page (progressive appearance)
│   ├── PagePreview.tsx          ← sandboxed iframe with blob URL
│   ├── ProgressFeed.tsx         ← live scrolling event log
│   ├── DemoBanner.tsx           ← runs remaining + BYOK CTA
│   └── ApiKeyInput.tsx          ← BYOK key modal (sessionStorage)
└── lib/
    ├── types.ts                 ← all shared interfaces
    ├── demo.ts                  ← demo session logic
    ├── scraper.ts               ← fetch URL → ScrapedSite (CSS concatenated, scripts stripped)
    ├── discover.ts              ← ScrapedSite → DiscoveredPage[] (nav parsing)
    ├── extractor.ts             ← ScrapedSite → DesignSystem / PageContent
    └── composer.ts              ← Claude call → self-contained HTML string
```

### Core types (`lib/types.ts`)

`ScrapedSite` → `DesignSystem` / `PageContent` → `ClonedPage` → `CloneResult`

SSE events: `CloneEvent` with `type: "status" | "page_complete" | "error" | "done"`

## Environment variables

```
ANTHROPIC_API_KEY=   # server key for demo runs
DEMO_RUN_LIMIT=3
DEMO_PAGE_LIMIT=3
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=   # from Clerk dashboard
CLERK_SECRET_KEY=                    # from Clerk dashboard
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
```
