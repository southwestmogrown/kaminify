# DEVLOG — site-clone-studio (kaminify)

## Status Summary

| Issue | Title | Milestone | Status |
|---|---|---|---|
| #1 | Scaffold | M1 | DONE |
| #2 | TypeScript types | M1 | DONE |
| #3 | Scraper utility | M1 | DONE |
| #4 | Page discovery | M1 | DONE |
| #5 | Extractors | M1 | DONE |
| #6 | Composer utility | M2 | DONE |
| #7 | /api/clone SSE route | M2 | DONE |
| #8 | UrlInputPanel | M3 | PENDING |
| #9 | ProgressFeed | M3 | PENDING |
| #10 | PageTabBar + PagePreview | M3 | PENDING |
| #11 | Main page + SSE client | M3 | PENDING |
| #12 | /api/download + ZIP | M4 | PENDING |
| #13 | ApiKeyInput + DemoBanner | M4 | PENDING |
| #14 | Polish pass | M4 | PENDING |
| #15 | README + deploy | M4 | PENDING |

---

## Bug Fixes

### [BUG] Vercel 404 on favicon and index — 2026-03-21 [FIXED]

**Symptoms:** `/favicon.ico` returning 404, then `/` returning 404 on Vercel production deployment.

**Root cause (favicon):** `main` contained only the initial commit (README.md, issues.md) — no app code. Fixed by merging M1.

**Root cause (index — persistent after M1 merge):** Vercel was first connected to the repo before any code existed. At that point it saved the Framework Preset as "Other" (static site). This preset is sticky — merging M1 did not trigger re-detection. Evidence: Vercel's deployment file listing showed only the six default `public/*.svg` files, confirming it was serving only static files and never running `next build`. The Next.js route table seen in CI (GitHub Actions) was never produced by Vercel itself.

**Fixes applied:**
1. `public/favicon.ico` — copied favicon to serve as static file, covering the raw `/favicon.ico` browser request in addition to the App Router metadata API path.
2. `vercel.json` with `{ "framework": "nextjs" }` — Vercel reads this before dashboard settings, overriding the stale "Other" preset and forcing the full Next.js build pipeline.

**Gotcha for future projects:** Connect Vercel only after pushing a `package.json`. If connected to an empty repo, the Framework Preset may be saved as "Other" and won't auto-correct — add `vercel.json` to force it.

---

## Entries

### [M2 #6] Composer utility — 2026-03-21 [DONE]

**What was built:**
- `src/lib/composer.ts` — `composePage(design, content, allPages, apiKey)` calls Claude (`claude-sonnet-4-6`, max_tokens 8192) with a structured JSON user message containing the design system, page content, navigation structure, and active slug
- CSS truncated to 8000 chars before passing to Claude
- Validates response starts with `<!DOCTYPE html>` (case-insensitive); throws descriptive error otherwise
- Anthropic client instantiated per-call (not module-level) to support BYOK key injection
- 6 unit tests via `vi.mock('@anthropic-ai/sdk')` — all passing

**Decisions:**
- `claude-sonnet-4-6` — capable enough for polished HTML generation, cost-effective vs Opus
- Client instantiated inside function, not at module level — avoids stale key if apiKey changes between calls
- `block?.type === 'text'` optional chain — safe against empty content array (code review catch)

**Gotchas:**
- `vi.mock` factory for Anthropic must return a plain constructor function (not `vi.fn().mockImplementation`) — otherwise `new Anthropic()` throws "not a constructor"

---

### [M2 #7] /api/clone SSE route — 2026-03-21 [DONE]

**What was built:**
- `src/app/api/clone/route.ts` — GET handler streaming SSE events for the full clone pipeline
- Auth: `x-api-key` header (BYOK) takes precedence over `ANTHROPIC_API_KEY` env var; 401 if neither
- Pipeline: scrape design → scrape content → discover pages → extract design system → per-page: extract content + compose + emit `page_complete`
- All errors caught → `error` SSE event → stream closes
- `maxPages` read from `DEMO_PAGE_LIMIT` env var (default 6); full session tracking deferred to M4
- `eslint.config.mjs` updated to ignore `coverage/**` (lint was flagging generated coverage files)
- 9 route unit tests with all lib functions mocked — all passing

**Decisions:**
- Auth simplified for M2: no cookie/session tracking — full demo session (run counts, session IDs) is M4 work when the UI is built
- `extractPageContent` called without `await` (it is synchronous; spec incorrectly marks it async)

---

### [M1 #1] Scaffold — 2026-03-21 [DONE]

**What was built:**
- Next.js 15 bootstrapped with TypeScript, App Router, Tailwind CSS v4
- Production deps: `@anthropic-ai/sdk`, `cheerio`, `archiver`
- Dev deps: `vitest`, `@vitest/coverage-v8`, testing library
- Vitest config with `environment: 'node'` for lib utilities
- GitHub Actions CI: lint-typecheck -> parallel (test + build)
- Font setup: Inter (prose) + JetBrains Mono (code/data) via next/font
- Design tokens as CSS custom properties in globals.css
- Placeholder exports for all components and lib utilities

**Decisions:**
- Vitest over Jest — native ESM + TypeScript, better cheerio compat, faster
- Tailwind v4 CSS-based config (no tailwind.config.ts needed)
- Design tokens in CSS custom properties from day one — avoids re-work when components are built in M3
- `Promise.allSettled` pattern planned for scraper stylesheet fetching
- `CloneEvent` will be a discriminated union (upgrade from flat interface in spec)

**Gotchas:**
- `create-next-app@15` may ask to overwrite README.md — pipe `yes` to accept
- `.env.local` must exist for `next dev` to work without warnings
