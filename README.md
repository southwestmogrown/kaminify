# kaminify

Paste two URLs — a design source and a content source — and kaminify's AI pipeline scrapes both sites, extracts the visual design system from the first, pulls the structured content from the second, and uses Claude to generate a cloned multi-page site that applies the design of one to the content of the other. Pages appear progressively as they're generated; preview them live in-browser and download the full site as a ZIP.

**[kaminify.com](https://kaminify.com)**

---

## How It Works

### Static Sites (no JavaScript)

The pipeline runs in two steps:

```
1. GET /api/prepare
   ├── scrapeSite(designUrl)     ← fetch + cheerio (fast, ~2s)
   ├── scrapeSite(contentUrl)    ← fetch + cheerio
   ├── detect jsRendered         ← checks body text, noscript hints, root divs
   ├── discoverPages(contentUrl) ← parses nav links for multi-page sites
   ├── extractDesignSystem()     ← CSS variables, color palette, fonts, components
   └── returns: designSystem + pages + model (Haiku for demo, text-only)

2. POST /api/compose (per page, SSE stream)
   ├── Claude Haiku receives: designSystem JSON + pageContent JSON
   └── returns: self-contained HTML
```

**Speed**: ~5–15s total
**Model**: Claude Haiku (demo) or user-selected (BYOK)

---

### JS-Rendered Sites (React, Vue, SPAs)

When `scrapeSite` detects signs of client-side rendering (sparse body text, `div#root`, `noscript` hints), it falls back to a headless browser:

```
1. GET /api/prepare
   ├── scrapeSite(designUrl)          ← detects jsRendered: true
   └── scrapeWithBrowser(designUrl)  ← puppeteer + Browserless
       ├── page.setViewport(512×384)
       ├── page.goto(url, waitUntil: 'networkidle0')
       │     OR (if SPA with periodic requests)
       ├── page.goto(url, waitUntil: 'load') + 2s evaluate delay
       ├── page.screenshot(encoding: 'base64', type: 'jpeg', quality: 60)
       └── returns: HTML + CSS + JPEG screenshot (~40KB)

   Same for contentUrl...

   └── extractDesignSystem()  ← from browser-rendered HTML
   └── returns: designSystem + pages + screenshots + model (upgraded to Sonnet)

2. POST /api/compose (per page, SSE stream)
   ├── screenshots present → Claude Sonnet receives:
   │     ├── Message 1: design donor screenshot + text prompt
   │     ├── Message 2: content donor screenshot + text prompt
   │     └── Message 3: designSystem JSON + pageContent JSON + navigation
   └── returns: self-contained HTML with visual DNA from design donor
```

**Speed**: ~30–90s total
**Model**: Claude Sonnet (mandatory — Haiku cannot process images)

---

### Model Selection

| Condition | Model Used |
|---|---|
| Static site, demo mode | **Haiku** (fast, cheap) |
| Static site, BYOK | User-selected (Haiku / Sonnet / Opus) |
| JS-rendered site, screenshots captured | **Sonnet** (automatic upgrade — Haiku can't read images) |

The UI shows a badge next to the model selector when the server automatically upgrades from Haiku to Sonnet due to JS-rendered site detection.

---

## Pipeline

```text
User submits designUrl + contentUrl
  └── GET /api/prepare
        ├── scrapeSite(designUrl)  ──→ jsRendered? ──→ scrapeWithBrowser()
        ├── scrapeSite(contentUrl) ──→ jsRendered? ──→ scrapeWithBrowser()
        ├── discoverPages(contentSite)
        ├── extractDesignSystem(designSite)
        └── returns: designSystem + pages + screenshots + model

  └── POST /api/compose (per page, SSE stream)
        ├── screenshots? → Claude Sonnet + image blocks + JSON
        │                (vision: analyzes colors, typography, mood)
        └── no screenshots → Claude Haiku + JSON only
        └── emit { type: "page_complete", page } (SSE)
```

---

## Local Setup

```bash
git clone https://github.com/your-username/kaminify.git
cd kaminify
npm install
cp .env.example .env.local
# fill in ANTHROPIC_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | — | Server-side Anthropic key for demo runs |
| `DEMO_RUN_LIMIT` | No | `3` | Max runs per session in demo mode |
| `DEMO_PAGE_LIMIT` | No | `3` | Max pages per run in demo mode |
| `NEXT_PUBLIC_DEMO_RUN_LIMIT` | No | `3` | Client-visible run limit for UI enforcement |
| `BROWSERLESS_WS_URL` | No | — | WebSocket URL for puppeteer (e.g. Browserless) |

---

## Demo Mode / BYOK

**Demo mode** — the hosted app gives every visitor 3 free runs using the server-side Anthropic key. No sign-up required.

**Bring Your Own Key (BYOK)** — click "Use your own API key" to enter your Anthropic API key. It is stored in `sessionStorage` only, passed directly to the API as a request header, and never persisted on the server. BYOK mode removes all run and page limits.

---

## Tech Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| AI | Anthropic Claude (Haiku / Sonnet) |
| HTML parsing | cheerio |
| Browser rendering | puppeteer-core + Browserless |
| ZIP generation | archiver |
| Deployment | Vercel |

---

## Potential Extensions

- **Persistent history** — save clone jobs to a database for revisiting or sharing.
- **Custom prompts** — expose a prompt editor to steer Claude's design interpretation.
- **Team sharing** — generate a shareable preview link per clone job with expiry and password protection.
