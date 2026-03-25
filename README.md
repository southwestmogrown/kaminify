# kaminify

Paste two URLs — a **design source** and a **content source** — and kaminify's AI pipeline scrapes both sites, extracts the visual design system from the first, pulls the structured content from the second, and uses Claude to generate a cloned multi-page site that applies the design of one to the content of the other. Pages appear progressively as they're generated; preview them live in-browser and download the full site as a ZIP.

**Live at [app.kaminify.com](https://app.kaminify.com)**

---

## How It Works

### The Two-Step Pipeline

```
1. GET /api/prepare
   ├── scrapeSite(designUrl)     ← fetch + cheerio, or headless Chrome if JS-rendered
   ├── scrapeSite(contentUrl)
   ├── detect jsRendered         ← sparse body text, div#root, noscript hints
   ├── discoverPages(contentUrl) ← parses nav links for multi-page sites
   ├── extractDesignSystem()     ← CSS variables, color palette, fonts, components
   └── returns: designSystem + DiscoveredPage[] + screenshots (if JS) + model

2. POST /api/compose (per page, SSE stream)
   ├── screenshots present → Claude Sonnet + vision image blocks + JSON
   └── text-only          → Claude Haiku + JSON
   └── emit { type: "page_complete", page } (SSE)
```

**Demo mode speed:** ~5–15s total (Haiku, text-only)
**JS-rendered speed:** ~30–90s total (Sonnet + screenshots)

---

### Model Selection

| Condition | Model |
|---|---|
| Static site, demo mode | **Haiku** (fast, cheap) |
| Static site, BYOK key | User-selected: Haiku / Sonnet / Opus |
| JS-rendered site (screenshots captured) | **Sonnet** — automatic upgrade; Haiku cannot process images |

A badge appears in the UI when the server auto-upgrades from Haiku to Sonnet due to JS-render detection.

---

### JS-Rendered Sites (React, Vue, Next.js, SPAs)

When static scraping detects signs of client-side rendering, kaminify falls back to headless Chrome via Browserless:

```
scrapeWithBrowser(url)
  ├── page.setViewport(512×384)
  ├── page.goto(url, waitUntil: 'networkidle0')  ← or 'load' + 2s delay for SPAs
  ├── page.screenshot(encoding: 'base64', type: 'jpeg', quality: 60)
  └── returns: HTML + CSS + JPEG screenshot (~40KB)
```

Screenshots are passed as image blocks to Claude Sonnet, which reads colors, typography, spacing, and visual mood directly from the captured pixels.

---

## Try an Example

The app ships with curated design→content pairings to demonstrate the pipeline. Click any pill to populate both fields:

- Stripe design → Tailwind Docs content
- Vercel design → GitHub profile content
- Linear design → Notion content

A random picker is available for discovery.

---

## Access Modes

### Anonymous (no sign-in)
- **3 demo runs** per session using the server-side Anthropic key
- Session-tracked via `sessionStorage`
- After 3 runs: prompted to sign in or add a BYOK key

### Signed In (Clerk)
- **3 free runs** per month, server-enforced via Supabase
- No API key required
- After exhausting free runs: prompted to add a BYOK key

### BYOK (Bring Your Own Key)
- Sign in → add your Anthropic key in settings
- Key encrypted at rest with **AES-256-GCM** (ciphertext + IV + auth tag stored in Supabase; plaintext never persisted)
- **Unlimited runs**, any model (Haiku / Sonnet / Opus)
- Key managed server-side — not stored in `sessionStorage`

---

## Local Setup

```bash
git clone https://github.com/your-username/kaminify.git
cd kaminify
npm install
cp .env.example .env.local
# fill in ANTHROPIC_API_KEY and all required env vars
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Server-side key for anonymous + signed-in free runs |
| `DEMO_RUN_LIMIT` | No | Max demo runs per session (default: 3) |
| `DEMO_PAGE_LIMIT` | No | Max pages per demo run (default: 3) |
| `NEXT_PUBLIC_DEMO_RUN_LIMIT` | No | Client-visible limit for UI (default: 3) |
| `BROWSERLESS_WS_URL` | No | WebSocket URL for headless Chrome (e.g. `wss://app.up.railway.app?token=TOKEN`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk dev/public key |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Yes | Clerk sign-in redirect path |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Yes | Clerk sign-up redirect path |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Yes | Post-sign-in redirect |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Yes | Post-sign-up redirect |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only) |
| `API_KEY_KEK` | Yes | 64-char hex key for AES-256-GCM API key encryption. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SENTRY_DSN` | No | Sentry DSN for error tracking |

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| AI | Anthropic Claude SDK (`@anthropic-ai/sdk`) |
| HTML parsing | cheerio |
| Browser rendering | puppeteer-core + Browserless (headless Chrome) |
| ZIP generation | archiver |
| Auth | Clerk (`@clerk/nextjs`) |
| Database | Supabase (Postgres + RLS) |
| Error tracking | Sentry |
| Deployment | Vercel |

---

## Architecture Notes

### Why two API endpoints?

`/api/clone` (legacy) ran the full pipeline in one serverless call. On Vercel Hobby (60s hard limit), a 3-page Sonnet run regularly hit the ceiling. The split:

- **`/api/prepare`** — scrape both URLs, extract design system + all page contents → JSON. Target: <30s worst case.
- **`/api/compose`** — one Claude call per page, SSE stream. Target: <40s per page.

The client orchestrates the page loop and handles abort on Stop.

### CSS information loss

The pipeline minimizes information loss at each extraction boundary. The `extractComponentCss()` function pairs each HTML component snippet (nav, hero, footer, card, button) with the CSS rules that target it — preventing the model from seeing styled class names with no associated rules.

See `skills/SKILL_design-cloning.md` for the full information-loss taxonomy and iteration history.

### API key encryption

API keys are encrypted with AES-256-GCM before being stored in Supabase. Each encryption uses a fresh IV (initialization vector). The KEK (key encryption key) is derived from the `API_KEY_KEK` environment variable. The DB stores `{ciphertext, iv, authTag}` as JSON — the plaintext key never touches persistent storage.

---

## Future Extensions

- **Persistent history** — save clone jobs server-side; re-open, share, or re-download
- **Design token editor** — tweak colors, fonts, or spacing before generation
- **Prompt iteration A/B testing** — track which system prompt variant produces better output
- **One-click deploy** — "Deploy to Vercel / Netlify" button per generated page
- **Template library** — save and reuse extracted design systems without re-scraping
