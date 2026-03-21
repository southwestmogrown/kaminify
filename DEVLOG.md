# DEVLOG — site-clone-studio (kaminify)

## Status Summary

| Issue | Title | Milestone | Status |
|---|---|---|---|
| #1 | Scaffold | M1 | DONE |
| #2 | TypeScript types | M1 | DONE |
| #3 | Scraper utility | M1 | DONE |
| #4 | Page discovery | M1 | DONE |
| #5 | Extractors | M1 | DONE |
| #6 | Composer utility | M2 | PENDING |
| #7 | /api/clone SSE route | M2 | PENDING |
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
