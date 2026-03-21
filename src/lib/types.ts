// A discovered page on the content site
export interface DiscoveredPage {
  url: string
  title: string
  slug: string      // used as the filename: "about" → "about.html"
  navLabel: string  // the link text from the nav, e.g. "About Us"
}

// Raw scraped data from a URL
export interface ScrapedSite {
  url: string
  html: string  // full raw HTML (scripts stripped)
  css: string   // all inline and linked CSS concatenated
  title: string
}

// Extracted design system from the design source
export interface DesignSystem {
  cssVariables: string  // :root { } block(s) — highest-signal design tokens
  colorPalette: string[]
  fontStack: string[]
  spacing: string[]
  borderRadius: string[]
  componentPatterns: {
    nav: string     // raw HTML of the nav component ("" if not found)
    hero: string    // raw HTML of the hero section ("" if not found)
    footer: string  // raw HTML of the footer ("" if not found)
    card: string    // raw HTML of a representative card ("" if not found)
    button: string  // raw HTML of a CTA button ("" if not found)
  }
  rawCss: string  // full CSS (stored unmodified; sliced before passing to Claude)
}

// Extracted content from one page of the content site
export interface PageContent {
  url: string
  title: string
  slug: string
  headings: string[]
  paragraphs: string[]
  listItems: string[]
  ctaTexts: string[]
  imageAlts: string[]
  metaDescription: string
}

// A single completed cloned page
export interface ClonedPage {
  slug: string
  title: string
  navLabel: string
  html: string          // complete self-contained HTML
  generatedAt: string   // ISO timestamp
}

// The full clone job result
export interface CloneResult {
  designUrl: string
  contentUrl: string
  pages: ClonedPage[]
  completedAt: string
}

// SSE event shapes sent from /api/clone — discriminated union for exhaustive narrowing
export type CloneEvent =
  | { type: 'status'; message: string }
  | { type: 'page_complete'; page: ClonedPage }
  | { type: 'error'; error: string }
  | { type: 'done' }

// Demo session (stored in sessionStorage)
export interface DemoSession {
  runsUsed: number
  startedAt: string
}

// BYOK session (stored in sessionStorage)
export interface ByokSession {
  apiKey: string   // user's Anthropic key
  addedAt: string
}
