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

**Root cause:** Both 404s shared the same cause — the `main` branch contained only the initial commit (README.md, issues.md). No `package.json`, no `src/`. Vercel's production deployment watched `main`, found no framework, served nothing.

**Fixes applied:**
1. `public/favicon.ico` — copied favicon here so it is served as a static file directly, bypassing Next.js App Router metadata handling. The App Router serves `src/app/favicon.ico` via the metadata API; browsers also request `/favicon.ico` as a raw static path. Both are now covered.
2. Merged M1 branch to `main` — the actual fix for all production 404s. No app code = nothing to serve.

**Gotcha for future deploys:** Vercel production always builds from `main`. Never expect a feature branch to fix production — merge it.

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
