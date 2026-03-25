# Skill: Mini Coder Max

## When To Use This Skill

Trigger keywords: `code`, `build`, `implement`, `create`, `develop`, `fix`, `refactor`, `architect`.

Use this skill when the user asks you to build new features, write utility functions, add API routes, create components, or otherwise produce code for the kaminify codebase.

---

## Project Context

**kaminify** (a.k.a. `site-clone-studio`) — paste two URLs (a design source and a content source), and the pipeline scrapes both, then uses Claude to generate a cloned multi-page site applying the design system of one to the content of the other. Preview pages live, download as ZIP.

### Tech Stack

| Layer | Choice |
|---|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| AI | Anthropic Claude SDK (`@anthropic-ai/sdk`) |
| HTML parsing | cheerio |
| Browser rendering | puppeteer-core + Browserless (headless Chrome) |
| ZIP generation | archiver |
| Auth | Clerk (`@clerk/nextjs`) |
| Database | Supabase (Postgres + RLS) |
| Error tracking | Sentry |
| Deployment | Vercel |

### Key Files

```
src/
├── app/
│   ├── api/
│   │   ├── clone/route.ts       ← SSE streaming pipeline (legacy, replaced by prepare/compose)
│   │   ├── prepare/route.ts     ← scrape both URLs, extract design + content, return JSON
│   │   ├── compose/route.ts    ← per-page Claude call, SSE stream of page_complete events
│   │   ├── download/route.ts    ← ZIP generation from cloned pages
│   │   └── me/route.ts         ← GET quota status + decrypted API key; POST/DELETE api-key
│   ├── page.tsx                 ← main UI, state, SSE client, model selector
│   ├── layout.tsx               ← ClerkProvider, fonts, dark theme variables
│   └── globals.css              ← design tokens, Clerk CSS overrides
├── components/
│   ├── UrlInputPanel.tsx         ← two URL inputs + example pills + model selector
│   ├── PageTabBar.tsx            ← progressive page tabs
│   ├── PagePreview.tsx           ← sandboxed iframe with blob URL
│   ├── ProgressFeed.tsx         ← live scrolling event log
│   ├── DemoBanner.tsx            ← signed-in vs anonymous quota state
│   └── ApiKeyInput.tsx           ← BYOK key modal (server-persisted for signed-in users)
└── lib/
    ├── types.ts                  ← all shared interfaces
    ├── scraper.ts                ← fetch URL → ScrapedSite (cheerio, CSS concat)
    ├── browserScraper.ts         ← headless Chrome fallback for JS-rendered sites
    ├── discover.ts                ← nav link parsing → DiscoveredPage[]
    ├── extractor.ts              ← ScrapedSite → DesignSystem / PageContent
    ├── composer.ts                ← Claude call → self-contained HTML string
    ├── auth.ts                    ← Clerk JWT verification helpers
    ├── quota.ts                   ← Supabase quota management
    ├── api-key-crypto.ts          ← AES-256-GCM encrypt/decrypt for stored API keys
    └── supabase.ts                ← adminClient (service role) + userClient
```

---

## Workflow

### Phase 1: Plan

1. **Understand the goal** — what is the user asking for, exactly?
2. **Check existing patterns** — before writing anything, read 2-3 similar files in the codebase to match conventions
3. **Define scope** — what is in-scope and out-of-scope
4. **Identify risks** — edge cases, breaking changes, downstream effects
5. **Plan the implementation** — which files, in what order, what tests

For simple tasks (1-2 files, <100 lines): skip to implementation. For moderate or complex tasks: write a brief plan first.

### Phase 2: Research

Before writing code, check the existing codebase for:
- Similar functionality you can extend or share code with
- Existing types or interfaces in `lib/types.ts` that should be reused
- Test patterns in `__tests__/` directories for the area you're modifying
- ESLint rules in `eslint.config.mjs` that may conflict with your approach

### Phase 3: Implement

1. **Start with types** — if the feature needs new interfaces, add them to `lib/types.ts` first
2. **Core logic** — build the utility/route/component in the right location
3. **Wire it up** — connect to existing state management or API flows
4. **Add tests** — unit tests for lib utilities, route tests for API endpoints, component tests for UI

### Phase 4: Review

Before finishing, run:

```bash
npm run lint   # fix all errors/warnings
npm run typecheck  # fix any new TypeScript errors
npm run test   # all tests must pass
```

Common catches:
- **Auth gating** — new API routes must handle three paths: anonymous (demo), signed-in (server quota), BYOK (`x-api-key` header). See `src/app/api/prepare/route.ts` for the canonical pattern.
- **AES-256-GCM** — if adding new stored secrets, use `encryptApiKey`/`decryptApiKey` from `api-key-crypto.ts`, not raw storage.
- **SSE streaming** — any new streaming endpoint must use `ReadableStream` + `TextEncoder`, emit events as `data: ${JSON.stringify(event)}\n\n`, and handle `AbortController`.
- **Supabase RLS** — direct `supabase.from()` reads are RLS-gated. Use `adminClient()` from `supabase.ts` only when RLS must be bypassed (server-side quota writes). Never expose the service role key client-side.
- **Clerk auth** — use `requireClerkUserId()` from `lib/auth.ts` to protect API routes that need a signed-in user.

### Phase 5: Deliver

- Confirm all three checks pass (lint, typecheck, test)
- Summarize what was built, what tradeoffs were made, any known limitations

---

## Common Patterns

### Adding a new API route

```typescript
// src/app/api/your-feature/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireClerkUserId } from '@/lib/auth';
// ...

export async function POST(req: NextRequest) {
  try {
    // 1. Auth — anonymous/demo vs signed-in vs BYOK
    const clerkUserId = await requireClerkUserId(req).catch(() => null);
    const apiKey = req.headers.get('x-api-key');

    // 2. Validate input
    // ...

    // 3. Route logic
    // ...

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

### Adding a new SSE event type

```typescript
// lib/types.ts — add to CloneEvent union:
export type CloneEventType = 'status' | 'page_complete' | 'error' | 'done' | 'your_new_type';

// In your route, emit it:
controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'your_new_type', ... })}\n\n`));
```

### Adding a component

Follow the pattern in `UrlInputPanel.tsx`:
- Props interface defined at top of file
- `useState` for internal state
- `useCallback` for handlers passed to children
- Export as default
- Co-located test file: `__tests__/YourComponent.test.tsx`

---

## Anti-Patterns

- ❌ **Don't add `console.log`** — use `console.error` for errors, or a proper logging lib
- ❌ **Don't bypass `adminClient()` checks** — never expose service role credentials
- ❌ **Don't add sessionStorage for auth** — sessionStorage is only for anonymous demo runs; signed-in state goes through Clerk + Supabase
- ❌ **Don't increase `RAW_CSS_LIMIT` or token limits** without a measured justification
- ❌ **Don't modify the old `/api/clone` route** — it is preserved as a rollback target; all new work uses `/api/prepare` + `/api/compose`
- ❌ **Don't skip the lint/typecheck/test trio** — these are the quality gate

---

## Quality Self-Check

Before delivering:
- ✓ Does it match existing code conventions?
- ✓ Are all new interfaces added to `lib/types.ts`?
- ✓ Does it handle the three auth paths (anonymous, signed-in, BYOK)?
- ✓ Are errors caught and returned as JSON, not thrown raw?
- ✓ Would you be proud to have your name on this?
- ✓ `npm run lint && npm run typecheck && npm run test` all pass?
