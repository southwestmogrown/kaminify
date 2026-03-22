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
| #8 | UrlInputPanel | M3 | DONE |
| #9 | ProgressFeed | M3 | DONE |
| #10 | PageTabBar + PagePreview | M3 | DONE |
| #11 | Main page + SSE client | M3 | DONE |
| #12 | /api/download + ZIP | M4 | DONE |
| #13 | ApiKeyInput + DemoBanner | M4 | DONE |
| #14 | Polish pass | M4 | DONE |
| #15 | README + deploy | M4 | DONE |

---

## Entries

### [fix/nav-hrefs] Fix inter-page navigation links — 2026-03-22 [DONE]

**Problem:** Cloned pages used anchor links (`#pricing`, `#contact-sales`) for navigation instead of file links (`pricing.html`, `contact-sales.html`). The navigation data sent to Claude only included `slug` and `label` — no `href` — so Claude guessed the format and defaulted to in-page anchors.

**Fix:** Added `href: \`${slug}.html\`` to each navigation entry in `composer.ts` and tightened the system prompt to instruct Claude to use the `href` field directly. One new test asserts the href shape.

---

### [feat/issue-47-per-page-orchestration] Per-page client orchestration — 2026-03-22 [DONE]

**Problem:** Single `/api/clone` SSE route ran the full pipeline in one serverless call. On Vercel Hobby (60s hard limit), a 3-page Sonnet run (3 × ~15s compose + ~15s setup) regularly hit the ceiling.

**Solution:** Split into two bounded endpoints. Client orchestrates the page loop.

- **`GET /api/prepare`** — scrape both sites (with browser fallback), discover pages, extract design system + all page contents → returns JSON. Target: <30s worst case (two browser scrapes in series).
- **`POST /api/compose`** — receives design system + one page content, runs one Claude call, streams SSE (`status` → `progress*` → `page_complete`). Target: <40s per page on Sonnet.

**Vercel timeout note:** `maxDuration: 60` is the correct value for Hobby — not a mistake. The fix works because each individual call now fits within 60s. If the plan upgrades to Pro, increase compose to 300s at that time.

**Client changes (`page.tsx` `startClone` only):**
- Calls `/api/prepare` once (JSON); pushes synthetic status/warning events locally
- Loops `/api/compose` once per page; streams each SSE response through `readComposeStream` helper
- Emits one synthetic `done` event after all pages complete
- `readComposeStream` filters per-compose `done` events + flushes residual buffer on stream close
- AbortController shared across all fetches; Stop button aborts in-flight call and exits loop

**Files added:**
- `src/app/api/prepare/route.ts` + `__tests__/route.test.ts` (13 tests)
- `src/app/api/compose/route.ts` + `__tests__/route.test.ts` (15 tests)

**Files modified:**
- `src/app/page.tsx` — `startClone` function replaced; all state, JSX, and other handlers untouched
- `vercel.json` — `maxDuration: 60` added for both new routes
- `DEVLOG.md`

**Files intentionally untouched:**
- `src/app/api/clone/route.ts` — preserved as rollback target; client no longer calls it
- All lib files, all components

**Test count:** 144 → 172 (+28)

---

### [fix/browser-scraper-diagnostics] Fix Browserless v2 WS path — 2026-03-22 [DONE]

**Root cause identified from Railway logs:**
`No matching WebSocket route handler for "http://0.0.0.0:8000/"` — Browserless v2 (`ghcr.io/browserless/chromium`) removed the root `/` WebSocket handler. Each browser now requires its own path: `/chromium` for Chromium, `/chrome` for Chrome. Our `BROWSERLESS_WS_URL` had no path segment, so every connection attempt was rejected at the routing level, producing a plain `{}` throw from puppeteer.

**What was fixed:**
- `src/lib/browserScraper.ts` — parse `BROWSERLESS_WS_URL` with `new URL()`; inject `/chromium` as pathname when path is empty or `/`; cleanup `finally` block changed from try/catch-rethrow (which shadows original errors) to `.catch()` with `console.error` (logs cleanup failures without masking the primary error)
- `src/lib/__tests__/browserScraper.test.ts` — 2 new tests: verifies `/chromium` path injection when URL has no path; verifies no double-append when path already set; tightened existing goto error assertion to match the full wrapped message

**No env var changes required** — fix is in code, existing `BROWSERLESS_WS_URL` format (no path) continues to work.

---

### [feat/issue-33-browser-scraper] Browser scraper fallback — 2026-03-22 [IN PROGRESS]

**What was built:**
- `src/lib/browserScraper.ts` — `scrapeWithBrowser(url)` connects to Railway-hosted Browserless via `BROWSERLESS_WS_URL`; mirrors `scrapeSite()` exactly (same CSS extraction, script stripping, ScrapedSite shape); throws descriptively when env var is unset; always disconnects in `finally`
- `src/app/api/clone/route.ts` — conditional browser fallback: when `jsRendered` is true, re-scrapes with browser instead of emitting a warning; `const` → `let` on both site vars
- `.env.example` — documents `BROWSERLESS_WS_URL`
- `src/lib/__tests__/browserScraper.test.ts` — 6 tests: missing env var, valid ScrapedSite, inline styles, linked stylesheets, script stripping, browser disconnect on error

**Design decisions:**
- `jsRendered: true` hardcoded on browser scraper return (we only call it when already detected)
- Railway hosts `ghcr.io/browserless/chromium`; WS URL format: `wss://app.up.railway.app?token=TOKEN`

---

### [feat/issue-33-js-render-detection] JS-render detection heuristic — 2026-03-21 [IN PROGRESS — PR #53 → staging]

**What was built:**
- `src/lib/types.ts` — added `jsRendered: boolean` to `ScrapedSite`
- `src/lib/scraper.ts` — detects JS-rendered sites before `noscript` strip using three signals: body text < 500 chars, presence of `div#root/app/__next/__nuxt`, or `<noscript>` containing "javascript"; sets `jsRendered` on returned object
- `src/app/api/clone/route.ts` — emits `warning` SSE events after each `scrapeSite()` call when `jsRendered` is true
- `src/lib/__tests__/scraper.test.ts` — 4 new test cases; 17/17 passing
- Fixed missing `jsRendered` in `ScrapedSite` mocks across `route.test.ts`, `discover.test.ts`, `extractor.test.ts`, `PageTabBar.test.tsx`

**Design decisions:**
- Non-blocking: detection is informational only; pipeline continues regardless

---

### [feat/issue-36-mobile-preview-toggle] Mobile preview toggle — 2026-03-21 [IN PROGRESS]

**What was built:**
- `src/app/page.tsx` — added `mobilePreview: boolean` state (default `false`); wired to `PageTabBar` and `PagePreview`; state persists across page tab changes
- `src/components/PageTabBar.tsx` — added Desktop/Mobile toggle icon-buttons on the right side of the tab bar; monitor + smartphone SVG icons; active mode gets accent color + dim background; `aria-label` and `aria-pressed` for accessibility; tabs inner div gets `flex-1` + `overflow-x-auto` so tabs scroll independently from toggle
- `src/components/PagePreview.tsx` — added `mobilePreview?: boolean` prop; when true, wraps iframe in centering container with `--color-bg-base` background and renders iframe at fixed 375px width with subtle `box-shadow` ring; desktop path unchanged

**Design decisions:**
- State persists across page tab changes — if you're checking mobile rendering, you want all pages in mobile mode
- No device chrome frame — clean dark background with a subtle outline shadow is sufficient for the portfolio aesthetic
- Toggle buttons guard no-op clicks (clicking active mode does nothing)

---

### [feat/issue-38-prompt-iteration] Model selector + pipeline hardening — 2026-03-21 [DONE — PR #44 → staging → main]

**What was built:**
- `src/lib/composer.ts` — `model` promoted to explicit parameter (was read from `COMPOSER_MODEL` env var); markdown code fence stripping before doctype validation (Haiku wraps output in ` ```html ` blocks despite instructions); `stop_reason === 'max_tokens'` check throws descriptive error instead of silently returning broken HTML; `trimStart()` before fence check
- `src/lib/extractor.ts` — `MAX_HEADINGS=12`, `MAX_PARAGRAPHS=20`, `MAX_LIST_ITEMS=25`, `MAX_CTA_TEXTS=8`, `MAX_IMAGE_ALTS=12` caps applied at return time — reduces input token burn for complex pages
- `src/app/api/clone/route.ts` — `byokKey` split from `apiKey` to distinguish demo vs BYOK at model selection time; module-level `BYOK_MODELS` allowlist; Haiku enforced server-side for demo (regardless of query param); BYOK allows Haiku/Sonnet/Opus with Sonnet as default; `model` passed to `composePage()`
- `src/app/page.tsx` — `model` state (defaults to Haiku; resets to Sonnet on BYOK key save, back to Haiku on clear); `model` included in `/api/clone` URLSearchParams; `model`/`onModelChange`/`hasApiKey` props passed to `UrlInputPanel`; `iframeSrc` initialized as `null` instead of `""` (fixes Next.js empty-src warning); iframe only renders once blob URL is ready
- `src/components/UrlInputPanel.tsx` — model `<select>` added left of Clone button; demo: single locked Haiku option; BYOK: all three options; button changed from `w-full` to `flex-1` to share row with selector; `MODEL_OPTIONS` constant at module level
- Tests: 132 passing — fence-stripping tests, model param tests, route test assertions updated to 5-arg `composePage`

**Decisions:**
- Server-side model enforcement — client sends preference, server validates against allowlist and forces Haiku for demo; can't be spoofed
- Haiku default for demo, Sonnet default for BYOK — Haiku is fast and cheap for demos; Sonnet is the right quality floor when users pay with their own key
- Model as parameter, not env var — env var approach didn't allow per-request control; caller now owns model selection, env var pattern retired
- `iframeSrc` null guard — iframe with `src=""` triggers Next.js warning and a redundant browser re-fetch of the page; null initial state + conditional render eliminates both

**Gotchas:**
- Haiku frequently wraps HTML in markdown code fences (` ```html `) even with explicit "output only HTML" instructions — fence stripping is a required post-processing step, not a prompt fix
- `stop_reason === 'max_tokens'` must be checked *before* doctype validation — a truncated response can still start with `<!DOCTYPE html>` and pass validation, silently producing a broken page
- Route tests asserting `composePage` call signature needed `expect.any(String)` as 5th arg after model param was added

---

### [Landing Alignment] Visual identity + copy — 2026-03-21 [DONE]

**What was built:**
- `src/app/globals.css` — full token replacement: orange accent (`#f97316`) replaces blue (`#1F6FEB`); warmer/darker backgrounds (`#07080d` base, `#0d0f18` surface, `#12141f` elevated); warm off-white text (`#e8e6e0`); rgba borders; teal success (`#1d9e75`); noise texture + grid atmospheric body overlays; `logo-dot` CSS keyframe animation
- `src/app/layout.tsx` — metadata description updated to "Clone any site's design. Keep your content."
- `src/app/page.tsx` — animated orange logo dot in header; tagline updated; hero block when `!hasStarted` (badge pill + bold headline + sub-copy matching landing); Download button uses black text on orange bg
- `src/components/UrlInputPanel.tsx` — helper text, button color (black on orange), "Try an example →", new "Stripe + me" pill
- `src/components/DemoBanner.tsx` — copy aligned to landing ("Your API key active", "free runs used · No account required", "Add your own API key →", "Free runs used up")
- `src/components/ApiKeyInput.tsx` — subtitle aligned to landing privacy copy
- `src/components/PagePreview.tsx` — empty/loading state copy updated
- All 121 tests updated and passing

**Decisions:**
- Orange accent from landing replaced blue wholesale — everything using `var(--color-accent)` automatically updated via CSS custom properties
- `body::before` / `body::after` pseudo-elements for noise + grid: purely visual, `pointer-events: none`, `z-index: 0` — cannot interfere with app UI
- Hero block only shown when `!hasStarted` — collapses cleanly once the pipeline runs so the two-column layout has full vertical space
- Black text on orange buttons (`color: '#000'`) — matches landing `.btn-primary`; high contrast per WCAG AA on `#f97316`

---

### [feat/puppeteer-headless-render] UX polish + pipeline stabilisation — 2026-03-21 [DONE — PR #30 → main]

**What was built:**
- `src/app/api/clone/route.ts` — progress ticker: `setInterval` every 2s during each `composePage` call, sends `{ type: 'progress', message: 'Generating X... Ns' }`; `clearInterval` in `finally`
- `src/components/ProgressFeed.tsx` — progress events update the active step label in-place (no list flooding); spinner enlarged to `w-4 h-4`, higher opacity; active step renders in `text-primary` vs muted for completed steps
- `src/app/page.tsx` — red **Stop** button in Pipeline header while running; calls `abortRef.current?.abort()` to halt fetch and stop token burn immediately
- `src/components/GeneratingAnimation.tsx` — Three.js particle network fills the preview panel during generation; 200 particles drift in 3D space, connected by indigo/violet lines based on proximity; orbiting camera; lazy-loaded via `next/dynamic` — zero impact on initial bundle
- `src/lib/composer.ts` — simplified system prompt to 4 hard constraints only (self-contained HTML, no invented content, design tokens, navigation); removed prescriptive layout rules that were over-constraining Claude's output
- `vercel.json` — `maxDuration: 60` (Hobby plan ceiling)
- 125 tests passing

**What was attempted and reverted:**
- Browserless.io JS rendering fallback (`renderer.ts`) — cascading timeouts broke the pipeline; `scripts`/`sections`/`interactivityPatterns` extraction added complexity without reliable gains; fully reverted, clean baseline restored at `0f2410e`

**Decisions:**
- Progress ticker over token streaming — avoids refactoring composer tests and the Anthropic mock; elapsed-time ticker gives equivalent UX signal (proof of life) with no added complexity
- Three.js lazy-loaded — `next/dynamic({ ssr: false })` keeps it out of the SSR bundle; only fetched when the animation actually mounts
- Simpler prompt = better output — numbered rules constrained Claude's layout decisions; removing them restored reliable, complete page generation
- JS-rendered sites remain an open problem — requires a dedicated solution (see Future Features)

---

## Future Features

| Priority | Feature | Notes |
|---|---|---|
| P0 | **JS-rendered site support** | Sites built on React/Vue/Next serve empty HTML to static scrapers. Need headless browser execution — options: Browserless.io (tried, timeout issues), Playwright in a long-running container, or a dedicated scrape microservice on AWS Lambda with higher timeout budget |
| P1 | **Auth + billing** | Free tier with BYOK (current); paid tier without API key (managed key, usage metered). Options: Clerk/Auth.js for auth, Stripe for billing, usage table in Postgres/Supabase |
| P1 | **Site storage + CRUD** | Persist generated sites server-side. Simple list view, re-open/preview, delete. Stretch: inline HTML editor for hotfixes on the generated output |
| P2 | **Prompt iteration** | A/B different system prompts, track which produces better output. Could expose a "quality" rating UI to collect signal |
| P2 | **Design token editor** | Let the user tweak color palette / fonts / spacing before generation — or after, with live re-render |
| P2 | **Mobile preview toggle** | Resize the iframe to 375px width to check responsive output without leaving the app |
| P3 | **One-click deploy** | "Deploy to Vercel / Netlify" button on each generated page — POST to their deploy APIs with the HTML as a static asset |
| P3 | **Template library** | Save and reuse extracted design systems. Clone a new content site onto a saved design without re-scraping |

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

### [M4 #12–15] Polish + Ship — 2026-03-21 [DONE]

**What was built:**
- `src/app/api/download/route.ts` — POST handler that collects archiver ZIP output into a `Buffer` via a `Writable` sink, returns `application/zip` response; compression level 6 (zlib default, good tradeoff for HTML)
- `src/lib/demo.ts` — `getDemoSession`, `incrementDemoRun`, `getByokSession`, `saveByokSession`, `clearByokSession`; all guarded with `isServer()` check; uses existing `DemoSession`/`ByokSession` types from `types.ts` (which include `startedAt`/`addedAt` timestamps)
- `src/components/ApiKeyInput.tsx` — fixed-position modal; password input; validates `key.startsWith('sk-ant-')`; calls `onSave(key)` + `onClose()` on valid submit; backdrop-click-to-close via `stopPropagation` on card
- `src/components/DemoBanner.tsx` — sticky banner with 3 states (BYOK active / runs remaining / limit reached); consolidated into single render path with shared outer div
- `src/app/page.tsx` — replaced `EventSource` + `sourceRef` with `fetch` + `ReadableStream` reader + `AbortController`; full BYOK/demo session wiring; Download button; responsive layout (`flex-col md:flex-row`)
- `README.md` — complete rewrite with pipeline diagram, env vars table, demo/BYOK docs, tech stack, potential extensions
- 27 new tests (demo.ts + download route + ApiKeyInput + DemoBanner); 121 total passing

**Decisions:**
- `fetch` + `ReadableStream` replaces `EventSource` — EventSource cannot send custom headers; one code path covers both demo (no header) and BYOK (`x-api-key` header)
- Demo enforcement client-side only via `sessionStorage` — no server-side run counting needed for a portfolio project
- `NEXT_PUBLIC_DEMO_RUN_LIMIT` env var — Next.js requires `NEXT_PUBLIC_` prefix for client-readable vars; added to `.env.example`
- Compression level 6 (not 9) — HTML compresses well at any level; level 9 adds CPU blocking with negligible size benefit
- `useMemo` for `activePage` — avoids `pages.find()` linear scan on unrelated renders (e.g. `isDownloading` toggle)
- `AbortError` check in `catch` — intentional abort should not flip `isRunning`; handled in catch only, not `finally`

**Gotchas:**
- archiver `finish` listener must be registered before `finalize()` is called — the event fires immediately after `finalize()` resolves; registering after misses it (race condition fixed in download route)
- `DemoSession` in `types.ts` includes `startedAt: string` field not in the original spec — agent used the canonical type rather than redefining a simpler one

---

### [M3 #8–11] UI + Streaming — 2026-03-21 [DONE]

**What was built:**
- `UrlInputPanel` — two URL inputs with blur validation (`new URL()`), example pills, spinner button
- `ProgressFeed` — live scrolling event log; spinner on last `status` event only while running; per-type styling (muted/success/error/bold)
- `PageTabBar` — progressive tab row, accent border on active, null when no pages yet
- `PagePreview` — sandboxed iframe via blob URL; `blobUrlRef` tracks URL for revocation; keyed on `page?.slug` to avoid thrashing on large HTML re-renders
- `src/app/page.tsx` — full SSE client with `EventSource`, `hasStarted` flag (never resets), `sourceRef` ref (not state), all components wired
- `vitest.config.ts` — added `@vitejs/plugin-react`, `setupFiles`, `coverage.include` for components; `// @vitest-environment jsdom` per-file directives
- `src/test.d.ts` — global `@testing-library/jest-dom` type reference
- 33 new component tests; 94 total passing

**Decisions:**
- `hasStarted` never resets: keeps layout visible after error or empty run — avoids jarring layout collapse
- `EventSource` stored in `useRef` (not `useState`): prevents re-renders on assignment; cleanup closes on unmount
- `scrollTo?.()` optional chain: jsdom doesn't implement `scrollTo` — guard prevents test failures without masking real browser bugs
- `page?.slug` as blob URL effect dependency: stable page identity; `page.html` would thrash on large strings
- Per-file `// @vitest-environment jsdom` instead of `environmentMatchGlobs`: more reliable across Vitest versions
- No skeleton tabs: `CloneEvent` union has no discovery-count event type — deferred to M4 if needed
- EventSource can't send custom headers: BYOK key not passed in M3; route falls back to `ANTHROPIC_API_KEY` env var

**Gotchas:**
- `@vitejs/plugin-react` must be in `vitest.config.ts` (not just `next.config.ts`) for JSX to parse in test files
- `@testing-library/user-event` not in initial deps — required for realistic user interaction tests
- `react-hooks/exhaustive-deps` warning on `PagePreview` effect — suppressed with `eslint-disable-next-line`; intentional design decision documented inline

---

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
