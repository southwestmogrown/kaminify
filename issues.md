# site-clone-studio — GitHub Issues

## Repo name
`site-clone-studio`

## Description
Paste two URLs — a design source and a content source. The pipeline scrapes
both sites, discovers their page structure, and generates a fully cloned
multi-page site that applies the design system of one to the content of the
other. Preview each page live, download the full site as a ZIP.

## Stack
- Next.js 15 (App Router, TypeScript)
- Tailwind CSS v4
- Vercel (frontend + API routes)
- Anthropic SDK (@anthropic-ai/sdk)
- cheerio (server-side HTML parsing)
- archiver (ZIP generation)

## Access model

**Demo mode** — no login, no API key required. 3 free runs per session using
your server-side Anthropic key. Limited to sites with 3 pages or fewer.
Persistent banner with BYOK upgrade CTA.

**BYOK mode** — user pastes their own Anthropic API key into the session.
Stored in sessionStorage only, never hits your server except as a
pass-through header. Unlimited runs, unlimited pages.

**Future:** Auth + paid tier where users pay per run through your key.
Earmarked in the README, not built now.

---

## Milestones

| Milestone | Due |
|---|---|
| M1 — Foundation + Scraping | End of Day 1 |
| M2 — Clone Pipeline | End of Day 2 |
| M3 — UI + Streaming | End of Day 3 |
| M4 — Download + Polish + Ship | End of Day 4 |

---

## Folder structure

```
src/
├── app/
│   ├── api/
│   │   ├── clone/route.ts         ← SSE streaming endpoint, runs pipeline
│   │   └── download/route.ts      ← ZIP generation and download
│   ├── layout.tsx
│   ├── page.tsx                   ← main UI, two URL inputs
│   └── globals.css
├── components/
│   ├── UrlInputPanel.tsx          ← two URL inputs + run button
│   ├── PageTabBar.tsx             ← tabs for each cloned page
│   ├── PagePreview.tsx            ← iframe rendering cloned HTML
│   ├── ProgressFeed.tsx           ← live status messages during pipeline
│   ├── DemoBanner.tsx             ← runs remaining + BYOK CTA
│   └── ApiKeyInput.tsx            ← BYOK key input modal/panel
└── lib/
    ├── types.ts
    ├── demo.ts                    ← demo session logic
    ├── scraper.ts                 ← fetch and parse any URL
    ├── discover.ts                ← find pages on a site
    ├── extractor.ts               ← extract design tokens and content
    └── composer.ts                ← Claude calls to compose final HTML
```

---

## M1 — Foundation + Scraping

### #1 — Scaffold project and install dependencies
**Labels:** `setup`
**Milestone:** M1 — Foundation + Scraping

Bootstrap the Next.js app, configure Tailwind, install dependencies, establish
folder structure.

**Dependencies:**
```
@anthropic-ai/sdk
cheerio
archiver
@types/archiver
```

Note: no Supabase this time. No database needed — everything is session-based
and stateless.

**Acceptance criteria**
- Repo on GitHub, public, description set
- App runs locally on localhost:3000 with no errors
- All dependencies in package.json
- Folder structure matches plan, placeholder exports in all empty files
- Vercel connected and auto-deploying on push

**Commits**
```
chore: initialize Next.js app with TypeScript and Tailwind
chore: install Anthropic, cheerio, and archiver dependencies
chore: establish folder structure with placeholder exports
```

---

### #2 — Define TypeScript types
**Labels:** `types`
**Milestone:** M1 — Foundation + Scraping

Create `lib/types.ts`.

```typescript
// A discovered page on the content site
export interface DiscoveredPage {
  url: string;
  title: string;
  slug: string;       // used as the filename: "about" → "about.html"
  navLabel: string;   // the link text from the nav, e.g. "About Us"
}

// Raw scraped data from a URL
export interface ScrapedSite {
  url: string;
  html: string;       // full raw HTML
  css: string;        // all inline and linked CSS concatenated
  title: string;
}

// Extracted design system from the design source
export interface DesignSystem {
  colorPalette: string[];     // hex values found in CSS
  fontStack: string[];        // font-family values
  spacing: string[];          // common spacing values
  borderRadius: string[];     // border-radius values
  componentPatterns: {
    nav: string;              // raw HTML of the nav component
    hero: string;             // raw HTML of the hero section
    footer: string;           // raw HTML of the footer
    card: string;             // raw HTML of a representative card
    button: string;           // raw HTML of a CTA button
  };
  rawCss: string;             // full CSS for reference
}

// Extracted content from one page of the content site
export interface PageContent {
  url: string;
  title: string;
  slug: string;
  headings: string[];
  paragraphs: string[];
  listItems: string[];
  ctaTexts: string[];
  imageAlts: string[];
  metaDescription: string;
}

// A single completed cloned page
export interface ClonedPage {
  slug: string;
  title: string;
  navLabel: string;
  html: string;             // complete self-contained HTML
  generatedAt: string;      // ISO timestamp
}

// The full clone job result
export interface CloneResult {
  designUrl: string;
  contentUrl: string;
  pages: ClonedPage[];
  completedAt: string;
}

// SSE event shapes sent from /api/clone
export type CloneEventType =
  | "status"        // progress message
  | "page_complete" // one page finished
  | "error"         // something went wrong
  | "done";         // all pages complete

export interface CloneEvent {
  type: CloneEventType;
  message?: string;           // for status events
  page?: ClonedPage;          // for page_complete events
  error?: string;             // for error events
}

// Demo session
export interface DemoSession {
  runsUsed: number;
  startedAt: string;
}

// BYOK session (stored in sessionStorage)
export interface ByokSession {
  apiKey: string;     // user's Anthropic key
  addedAt: string;
}
```

**Acceptance criteria**
- All types exported, no TypeScript errors
- CloneEvent union covers every message the SSE stream sends

**Commits**
```
feat: define all TypeScript interfaces in lib/types.ts
```

---

### #3 — Build scraper utility
**Labels:** `util`
**Milestone:** M1 — Foundation + Scraping

Implement `lib/scraper.ts`. Given a URL, fetches the page and returns a
ScrapedSite object. Handles CSS — both inline `<style>` tags and linked
stylesheets. Linked stylesheets are fetched and concatenated.

```typescript
export async function scrapeSite(url: string): Promise<ScrapedSite>
```

**Implementation notes:**
- Use native `fetch` — no Puppeteer, no Playwright. Static HTML only.
- Set a realistic User-Agent header to avoid bot blocks
- Timeout after 10 seconds, throw a descriptive error if exceeded
- Use cheerio to parse the HTML
- For linked CSS: find all `<link rel="stylesheet">` tags, resolve relative
  URLs against the base URL, fetch each one, concatenate the results
- Strip `<script>` tags from the HTML before returning — not needed and
  can cause issues when injected into an iframe
- Handle fetch errors gracefully — a failed stylesheet fetch should not
  abort the whole scrape, just skip that stylesheet

**Acceptance criteria**
- scrapeSite("https://example.com") returns a valid ScrapedSite
- Linked stylesheets are fetched and included in the css field
- Script tags are stripped from the returned HTML
- Function throws a descriptive error if the URL is unreachable
- Relative stylesheet URLs are correctly resolved to absolute

**Commits**
```
feat: add scraper utility with CSS concatenation
```

---

### #4 — Build page discovery utility
**Labels:** `util`
**Milestone:** M1 — Foundation + Scraping

Implement `lib/discover.ts`. Given a ScrapedSite, finds all internal pages
linked from the nav and returns them as DiscoveredPage objects.

```typescript
export function discoverPages(
  site: ScrapedSite,
  maxPages?: number
): DiscoveredPage[]
```

**Discovery strategy:**
1. Parse the HTML with cheerio
2. Find the `<nav>` element (or fall back to `<header>`)
3. Extract all `<a>` tags within the nav
4. Filter to internal links only — same domain or relative paths
5. Deduplicate by URL
6. Exclude obvious non-page links: #anchors, mailto:, tel:, /cdn, /assets
7. Always include the root URL as the first page (slug: "index")
8. Resolve relative URLs to absolute using the site's base URL
9. Generate a slug from the URL path: "/about-us" → "about-us"
10. Cap at maxPages (default 6 for BYOK, 3 for demo)

**Acceptance criteria**
- Returns at least 1 page (the root) for any valid site
- Nav links correctly resolved to absolute URLs
- Anchor-only links (#section) excluded
- Slugs are URL-safe strings with no slashes
- Duplicate URLs deduplicated
- maxPages cap respected

**Commits**
```
feat: add page discovery utility with nav parsing
```

---

### #5 — Build design and content extractors
**Labels:** `util`
**Milestone:** M1 — Foundation + Scraping

Implement `lib/extractor.ts`. Two functions — one extracts the design system
from the design source, one extracts content from a single page of the content
source.

```typescript
export function extractDesignSystem(site: ScrapedSite): DesignSystem
export function extractPageContent(
  site: ScrapedSite,
  page: DiscoveredPage
): PageContent
```

**extractDesignSystem** — parses the CSS for color values (hex, rgb, hsl),
font-family declarations, common spacing values, and border-radius values.
Uses cheerio to find representative HTML components — the nav, a hero-like
section (first large section), footer, cards, and CTA buttons.

**extractPageContent** — parses the HTML for all h1-h4 headings, paragraph
text, list items, button/link CTA text, img alt text, and meta description.
Strips HTML tags from text values. Keeps only meaningful text — filters out
navigation labels, cookie banners, and footer boilerplate.

**Acceptance criteria**
- extractDesignSystem returns non-empty colorPalette and fontStack for any
  CSS-rich site
- extractPageContent returns non-empty headings and paragraphs for any
  content-rich page
- Both functions handle missing elements gracefully (empty arrays, not errors)
- Text values are stripped of HTML tags

**Commits**
```
feat: add design system extractor from CSS and HTML
feat: add page content extractor with text cleaning
```

---

## M2 — Clone Pipeline

### #6 — Build composer utility
**Labels:** `util`
**Milestone:** M2 — Clone Pipeline

Implement `lib/composer.ts`. The Claude call that produces one cloned page.
Takes a DesignSystem and PageContent, returns a complete self-contained HTML
string.

```typescript
export async function composePage(
  design: DesignSystem,
  content: PageContent,
  allPages: DiscoveredPage[],  // for generating correct nav links
  apiKey: string
): Promise<string>
```

**The system prompt:**
```
You are an expert web developer. You will be given a design system extracted
from one website and content extracted from another. Your job is to produce
a complete, self-contained HTML page that:

1. Uses the visual design (colors, fonts, spacing, component patterns) from
   the design system
2. Fills that design with the provided content
3. Includes a working navigation linking to all provided pages
4. Is entirely self-contained — all CSS must be inline or in a <style> tag,
   no external dependencies
5. Looks polished and professional
6. Uses semantic HTML5 elements

Return ONLY the complete HTML document starting with <!DOCTYPE html>.
No explanation, no markdown, no code fences.
```

**The user message** is a structured JSON blob containing:
- The design system (colors, fonts, component patterns with raw HTML examples)
- The page content (headings, paragraphs, CTAs, meta)
- The navigation structure (page slugs and labels for building nav links)
- The page slug being generated (so it can mark the active nav item)

**Token budget awareness:**
The raw CSS from a design site can be enormous. Before passing it to Claude,
truncate rawCss to 8000 characters — enough for Claude to understand the
design without blowing the context window.

**Acceptance criteria**
- composePage returns a string starting with "<!DOCTYPE html>"
- Output is valid HTML parseable by the browser
- Nav includes links to all provided pages
- Active page is visually indicated in the nav
- CSS is entirely inline or in a style tag — no external links
- Function throws descriptive error if Claude returns non-HTML

**Commits**
```
feat: add composer utility with Claude HTML generation
```

---

### #7 — Build /api/clone SSE streaming route
**Labels:** `api`
**Milestone:** M2 — Clone Pipeline

The core API route. Accepts design URL and content URL, runs the full pipeline,
streams progress events back to the client using Server-Sent Events.

**Server-Sent Events (SSE) primer:**
SSE is a simple protocol for one-way server-to-client streaming over HTTP.
The response has Content-Type: text/event-stream. Each event is a text line
starting with "data: " followed by JSON, terminated by two newlines.

```typescript
// SSE response setup
const encoder = new TextEncoder();
const stream = new ReadableStream({
  async start(controller) {
    const send = (event: CloneEvent) => {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
      );
    };

    try {
      send({ type: "status", message: "Scraping design site..." });
      const designSite = await scrapeSite(designUrl);

      send({ type: "status", message: "Scraping content site..." });
      const contentSite = await scrapeSite(contentUrl);

      send({ type: "status", message: "Discovering pages..." });
      const pages = discoverPages(contentSite, maxPages);

      send({ type: "status", message: `Found ${pages.length} pages` });
      const designSystem = extractDesignSystem(designSite);

      for (const page of pages) {
        send({ type: "status", message: `Generating ${page.navLabel}...` });
        const content = await extractPageContent(contentSite, page);
        const html = await composePage(designSystem, content, pages, apiKey);
        const clonedPage: ClonedPage = {
          slug: page.slug,
          title: page.title,
          navLabel: page.navLabel,
          html,
          generatedAt: new Date().toISOString(),
        };
        send({ type: "page_complete", page: clonedPage });
      }

      send({ type: "done" });
    } catch (err) {
      send({ type: "error", error: String(err) });
    } finally {
      controller.close();
    }
  },
});

return new Response(stream, {
  headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  },
});
```

**Auth/demo validation:**
- Check for BYOK key in request header first
- If no BYOK key, check for demo session cookie and validate run count
- If neither, return 401

**Acceptance criteria**
- GET /api/clone?designUrl=X&contentUrl=Y streams SSE events
- Status events appear as each pipeline step begins
- page_complete event fires for each finished page with full HTML
- done event fires after all pages complete
- error event fires on any failure, stream then closes
- Demo runs validated against DEMO_RUN_LIMIT
- BYOK key passed to composer utility

**Commits**
```
feat: add /api/clone SSE route with full pipeline
feat: add demo and BYOK validation to /api/clone
```

---

## M3 — UI + Streaming

### #8 — Build UrlInputPanel component
**Labels:** `component`
**Milestone:** M3 — UI + Streaming

The entry point. Two URL inputs side by side — design source on the left,
content source on the right. A Clone button below. Validation before submit.

```typescript
interface UrlInputPanelProps {
  onClone: (designUrl: string, contentUrl: string) => void;
  isRunning: boolean;
  disabled?: boolean;
}
```

**URL validation:**
- Must start with http:// or https://
- Must be a valid URL (use `new URL()` — throws if invalid)
- Both fields required before Clone button enables

**Helper text beneath each input:**
- Design source: "The site whose visual style you want to use"
- Content source: "The site whose content you want to redesign"

**Example URL pairs** shown as clickable pills to populate both fields at once:
- Stripe design + your GitHub profile
- Linear design + your GitHub profile
- Vercel design + your GitHub profile

**Acceptance criteria**
- Both inputs validate as URLs before enabling Clone button
- Invalid URL shows inline error on blur
- Clone button disabled while isRunning or disabled
- Clone button shows spinner while isRunning
- Example pills populate both fields simultaneously
- onClone fires with both URL strings on submit

**Commits**
```
feat: add UrlInputPanel with validation and example pairs
```

---

### #9 — Build ProgressFeed component
**Labels:** `component`
**Milestone:** M3 — UI + Streaming

Displays the live stream of status messages during pipeline execution. Shows
each event as it arrives — a scrolling log of what the pipeline is doing.

```typescript
interface ProgressFeedProps {
  events: CloneEvent[];
  isRunning: boolean;
}
```

Each event renders as a row:
- `status` events — muted text with a spinner icon while running
- `page_complete` events — green checkmark, page name, generation time
- `error` events — red text with the error message
- `done` event — bold "All pages complete" with a checkmark

Auto-scrolls to the bottom as new events arrive (useEffect on events.length,
scroll the container ref to scrollHeight).

**Acceptance criteria**
- Each event type renders with correct styling
- Container auto-scrolls to latest event
- Spinner shows next to the current in-progress status message
- Completed pages show a checkmark and the page slug

**Commits**
```
feat: add ProgressFeed with auto-scroll and event styling
```

---

### #10 — Build PageTabBar and PagePreview components
**Labels:** `component`
**Milestone:** M3 — UI + Streaming

After pages start completing, they appear as tabs. Clicking a tab shows that
page's preview in an iframe.

**PageTabBar.tsx:**
```typescript
interface PageTabBarProps {
  pages: ClonedPage[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
}
```

Tabs appear one by one as page_complete events arrive. Each tab shows the
page's navLabel. Active tab has accent border bottom. A loading skeleton tab
appears for pages still generating (based on total discovered pages vs
completed pages).

**PagePreview.tsx:**
```typescript
interface PagePreviewProps {
  page: ClonedPage | null;
  isLoading?: boolean;
}
```

Renders the cloned HTML in a sandboxed iframe using a blob URL. This is the
key technique — instead of setting iframe src to a URL, you create a Blob from
the HTML string and use URL.createObjectURL() to get a local URL. This means
no server round-trip and no CORS issues.

```typescript
const blob = new Blob([page.html], { type: "text/html" });
const url = URL.createObjectURL(blob);
// set iframe src to url
// cleanup: URL.revokeObjectURL(url) on unmount or page change
```

**Acceptance criteria**
- Tabs appear as page_complete events arrive
- Skeleton tabs show for not-yet-completed pages
- Clicking a tab renders that page's HTML in the iframe
- iframe is sandboxed: sandbox="allow-scripts allow-same-origin"
- Blob URLs are revoked on page change and unmount (no memory leak)
- PagePreview shows a loading state when isLoading is true

**Commits**
```
feat: add PageTabBar with progressive tab appearance
feat: add PagePreview with blob URL iframe rendering
```

---

### #11 — Assemble main page and wire SSE client
**Labels:** `integration`
**Milestone:** M3 — UI + Streaming

Compose all components in `app/page.tsx`. Wire the SSE connection using the
EventSource API. Manage all state.

**State to manage:**
```typescript
const [designUrl, setDesignUrl] = useState("");
const [contentUrl, setContentUrl] = useState("");
const [isRunning, setIsRunning] = useState(false);
const [events, setEvents] = useState<CloneEvent[]>([]);
const [pages, setPages] = useState<ClonedPage[]>([]);
const [activeSlug, setActiveSlug] = useState<string | null>(null);
const [apiKey, setApiKey] = useState<string | null>(null); // from BYOK session
```

**SSE wiring:**
```typescript
const startClone = () => {
  setIsRunning(true);
  setEvents([]);
  setPages([]);

  const params = new URLSearchParams({ designUrl, contentUrl });
  const source = new EventSource(`/api/clone?${params}`);

  source.onmessage = (e) => {
    const event: CloneEvent = JSON.parse(e.data);
    setEvents((prev) => [...prev, event]);

    if (event.type === "page_complete" && event.page) {
      setPages((prev) => [...prev, event.page!]);
      setActiveSlug((prev) => prev ?? event.page!.slug);
    }
    if (event.type === "done" || event.type === "error") {
      setIsRunning(false);
      source.close();
    }
  };

  source.onerror = () => {
    setIsRunning(false);
    source.close();
  };
};
```

**Layout:**
```
┌─────────────────────────────────────────────┐
│  Header + DemoBanner                        │
├─────────────────────────────────────────────┤
│  UrlInputPanel (centered, full width)       │
├──────────────┬──────────────────────────────┤
│              │  PageTabBar                  │
│ ProgressFeed ├──────────────────────────────┤
│              │  PagePreview (iframe)         │
│              │                              │
└──────────────┴──────────────────────────────┘
```

Left column (ProgressFeed) is fixed width ~280px. Right column takes remaining
space. Both columns only appear after Clone is first clicked.

**Acceptance criteria**
- Clone button starts SSE connection
- Events stream in and ProgressFeed updates live
- Pages appear in PageTabBar as they complete
- First completed page auto-selects in preview
- EventSource closed on done/error
- No memory leaks (EventSource cleaned up on unmount)

**Commits**
```
feat: assemble main page with SSE client and state management
```

---

## M4 — Download + Polish + Ship

### #12 — Build /api/download route and download button
**Labels:** `feature`
**Milestone:** M4 — Download + Polish + Ship

After all pages complete, a Download ZIP button appears. Clicking it POSTs
all cloned pages to /api/download which returns a ZIP file.

**app/api/download/route.ts** — accepts a POST with `{ pages: ClonedPage[] }`,
uses the `archiver` library to create a ZIP containing one HTML file per page
(index.html, about.html, etc.), streams it back as a download.

```typescript
// Response headers for file download
headers: {
  "Content-Type": "application/zip",
  "Content-Disposition": 'attachment; filename="cloned-site.zip"'
}
```

**In page.tsx** — a Download ZIP button appears after `isRunning` is false and
`pages.length > 0`. Sends pages to /api/download and triggers browser download
using the Blob + URL.createObjectURL pattern (same as CSV export in the
ops dashboard).

**Acceptance criteria**
- Download button appears only after all pages complete
- ZIP contains one correctly named HTML file per page
- index.html is always present for the root page
- Downloaded ZIP opens correctly and each HTML file renders in a browser
- Button shows loading spinner while ZIP is being generated

**Commits**
```
feat: add /api/download route with archiver ZIP generation
feat: add download button with blob-triggered file save
```

---

### #13 — Build ApiKeyInput and DemoBanner components
**Labels:** `feature`
**Milestone:** M4 — Download + Polish + Ship

**lib/demo.ts** — demo session logic. Same pattern as form-builder and
prompt-playground. Stored in sessionStorage.

**components/ApiKeyInput.tsx** — a modal or slide-out panel. User pastes
their Anthropic API key. Saved to sessionStorage as a ByokSession. Key is
shown as masked input. A "Remove key" option clears it.

**components/DemoBanner.tsx** — sticky banner showing runs remaining and a
"Use your own API key" CTA that opens ApiKeyInput. After adding a key, banner
changes to show "Using your API key — unlimited runs."

**Demo restrictions:**
- 3 runs max per session
- Max 3 pages per run
- After limit reached, Clone button disabled with upgrade message

**Acceptance criteria**
- DemoBanner shows correct run count
- ApiKeyInput modal opens from banner CTA
- Valid key format validated before saving (must start with "sk-ant-")
- Key stored in sessionStorage, persists across page refreshes
- BYOK session removes run limit and page cap
- After 3 demo runs, Clone button disabled with message

**Commits**
```
feat: add demo session logic in lib/demo.ts
feat: add ApiKeyInput modal with sessionStorage persistence
feat: add DemoBanner with run count and BYOK CTA
```

---

### #14 — Polish pass
**Labels:** `polish`
**Milestone:** M4 — Download + Polish + Ship

Loading states, error handling, empty states, responsive layout, page title,
favicon, meta description.

**Specific items:**
- Error state when a URL is unreachable — inline message below the input
- Error state when Claude returns non-HTML — shown in ProgressFeed as error
  event
- Empty state before first clone — a brief description of what the tool does
  with the example URL pills prominent
- Page title: "Site Clone Studio"
- Meta description for SEO/sharing
- Favicon
- Console clean in production build

**Commits**
```
fix: add error states for unreachable URLs and failed generation
chore: set page title, favicon, and meta description
```

---

### #15 — Write README and deploy to production
**Labels:** `docs`
**Milestone:** M4 — Download + Polish + Ship

README covers what it is, how it works technically (pipeline diagram in
markdown), local setup, env var documentation, demo mode instructions,
BYOK instructions, and a "future paid tier" section.

**Production env vars:**
```
ANTHROPIC_API_KEY=    ← your key for demo runs only
DEMO_RUN_LIMIT=3
DEMO_PAGE_LIMIT=3
```

**The demo video is non-optional for this project.** This is your most
visually impressive portfolio piece. Record a 2-minute Loom:
- Paste Stripe + your GitHub profile URL
- Watch the pages generate one by one in the ProgressFeed
- Click through the page tabs in the preview
- Download the ZIP
- Open the ZIP and show the HTML files rendering

**Acceptance criteria**
- README renders cleanly on GitHub with pipeline description
- Production URL live on Vercel
- All env vars set in Vercel dashboard
- Demo mode works end to end on production URL
- BYOK mode works end to end on production URL
- Loom demo recorded and linked in README
- All issues closed, all milestones marked complete

**Commits**
```
docs: add README with pipeline docs and BYOK instructions
chore: configure all production environment variables
```