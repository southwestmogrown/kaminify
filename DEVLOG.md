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
