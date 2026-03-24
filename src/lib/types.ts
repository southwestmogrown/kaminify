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
  html: string     // full raw HTML (scripts stripped)
  css: string      // all inline and linked CSS concatenated
  title: string
  jsRendered: boolean  // true if site appears to require JS for content
  screenshot?: string  // base64 JPEG (60% quality, 512×384) captured after full render (for vision analysis)
}

// A single heading level's font information
export interface HeadingFontPair {
  level: string       // "h1" | "h2" | ... | "h6"
  fontFamily: string
  fontSize: string
}

// Extracted design system from the design source
export interface DesignSystem {
  cssVariables: string  // :root { } block(s) — highest-signal design tokens
  colorPalette: string[]
  fontStack: string[]
  spacing: string[]
  borderRadius: string[]
  headingFontPairs?: HeadingFontPair[]  // h1-h6 font-family and font-size pairs
  backgroundEffects?: string[]         // background-image, linear-gradient, radial-gradient values (max 10)
  shadowValues?: string[]             // box-shadow, text-shadow values (max 10)
  componentCss?: {                    // CSS rules matching each component snippet (max 1500 chars each)
    nav: string
    hero: string
    footer: string
    card: string
    button: string
  }
  componentPatterns: {
    nav: string     // raw HTML of the nav component ("" if not found)
    hero: string    // raw HTML of the hero section ("" if not found)
    footer: string  // raw HTML of the footer ("" if not found)
    card: string    // raw HTML of a representative card ("" if not found)
    button: string  // raw HTML of a CTA button ("" if not found)
  }
  rawCss: string  // full CSS (stored unmodified; sliced before passing to Claude)
  webFontUrl?: string  // Google Fonts stylesheet URL, if found on the design site
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
  | { type: 'progress'; message: string }   // live update while Claude is generating (replaces current step display)
  | { type: 'warning'; message: string }
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

// DB user record
export interface UserRecord {
  id: string
  clerk_user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: 'free' | 'pro'
  runs_this_month: number
  month_start: string  // ISO date YYYY-MM-DD
  created_at: string
  updated_at: string
}

// Quota status returned by lib/quota.ts
export interface QuotaStatus {
  tier: 'anon' | 'free' | 'pro'
  runsUsed: number
  runsLimit: number | null  // null = unlimited
  canRun: boolean
}
