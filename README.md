# kaminify

Paste two URLs — a design source and a content source — and kaminify's AI pipeline scrapes both sites, extracts the visual design system from the first, pulls the structured content from the second, and uses Claude to generate a cloned multi-page site that applies the design of one to the content of the other. Pages appear progressively as they're generated; preview them live in-browser and download the full site as a ZIP.

**[kaminify.com](https://kaminify.com)**

[Watch the walkthrough](LOOM_URL_HERE)

---

## Pipeline

```text
User submits designUrl + contentUrl
  └── GET /api/clone?designUrl=X&contentUrl=Y   (SSE stream)
        ├── scrapeSite(designUrl)                 scrape HTML + CSS
        ├── scrapeSite(contentUrl)                scrape HTML + CSS
        ├── discoverPages(contentSite)            parse nav → DiscoveredPage[]
        ├── extractDesignSystem(designSite)       colors, fonts, spacing, components
        └── for each discovered page:
              extractPageContent(page)            headings, paragraphs, CTAs, meta
              composePage(design, content, apiKey) → Claude → self-contained HTML
              emit  { type: "page_complete", page }  (SSE)
        └── emit  { type: "done" }                (SSE)
```

---

## Local Setup

```bash
git clone https://github.com/your-username/kaminify.git
cd kaminify
npm install
```

Copy the example env file and fill in your Anthropic key:

```bash
cp .env.example .env.local
```

```env
ANTHROPIC_API_KEY=sk-ant-...
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | — | Server-side Anthropic key used for demo runs |
| `DEMO_RUN_LIMIT` | No | `3` | Max clone runs allowed per session in demo mode |
| `DEMO_PAGE_LIMIT` | No | `3` | Max pages cloned per run in demo mode |
| `NEXT_PUBLIC_DEMO_RUN_LIMIT` | No | `3` | Client-visible run limit used for UI enforcement |

---

## Demo Mode / BYOK

**Demo mode** — the hosted app gives every visitor 3 free runs using the server-side Anthropic key. No sign-up required.

**Bring Your Own Key (BYOK)** — click "Use your own API key" in the banner to enter your Anthropic API key. It is stored in `sessionStorage` only, passed directly to the API as a request header, and never persisted on the server. BYOK mode removes all run and page limits.

---

## Tech Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| AI | Anthropic Claude (claude-sonnet-4-6) |
| HTML parsing | cheerio |
| ZIP generation | archiver |
| Deployment | Vercel |

---

## Potential Extensions

- **Persistent history** — save clone jobs to a database so users can revisit or share previously generated sites.
- **Custom prompts** — expose a prompt editor so users can steer Claude's interpretation of the design system (e.g., "make it darker", "use a two-column layout").
- **Team sharing** — generate a shareable preview link per clone job, with expiry and password protection.
