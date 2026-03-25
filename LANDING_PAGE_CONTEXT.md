# Landing Page Update — Beta Launch Context

## What to Communicate

kaminify is ready for beta. The core product works end-to-end. The landing page should communicate:

1. **What it is** — paste two URLs, get a cloned multi-page site with the design of one applied to the content of the other
2. **That it's live and working** — [app.kaminify.com](https://app.kaminify.com)
3. **What's new since last iteration** — full auth system, unlimited BYOK, JS-rendered site support, model selector

---

## Product Summary (for copy)

**Tagline:** "Clone any site's design. Keep your content."

**One-liner:** Paste a design URL and a content URL. kaminify scrapes both, extracts the visual design system, and generates a fully cloned multi-page site — applying the donor's design to your content. Preview pages live, download as a ZIP.

**Key features:**
- Multi-page sites supported (nav links auto-discovered)
- Works with **static sites** AND **JavaScript-rendered SPAs** (React, Vue, Next.js)
- Three AI models to choose from: Haiku (fast/cheap), Sonnet (balanced), Opus (highest quality)
- Live preview as pages generate (progressive SSE streaming)
- Download as a ZIP — fully self-contained HTML, no external dependencies
- No sign-up required to try (3 free runs)
- Sign in for 3 free server-enforced runs per month
- Bring your own Anthropic key for unlimited generation

---

## Access Modes (for copy)

| Mode | Runs | Pages/Run | API Key |
|---|---|---|---|
| Anonymous | 3 / session | 3 | Server key |
| Signed in | 3 / month | 3 | Server key |
| BYOK | Unlimited | Unlimited | Your own key |

**Beta note:** During beta, sign-in is free and unlimited. The 3/month quota activates post-beta.

---

## Design / Visual Identity

The app (`app.kaminify.com`) uses this palette — the landing page should align:

| Token | Hex | Use |
|---|---|---|
| Accent | `#f97316` | CTAs, highlights, active states |
| Background | `#07080d` | Page background |
| Surface | `#0d0f18` | Cards, panels |
| Elevated | `#12141f` | Modals, dropdowns |
| Text | `#e8e6e0` | Primary text |
| Muted text | `#9e9d98` | Secondary text |
| Success | `#1d9e75` | Positive states |
| Border | `rgba(255,255,255,0.07)` | Subtle dividers |

Atmospheric: grid overlay + noise texture on body background.

---

## Screenshots / Demo

The most visually impressive demo shows:
1. Stripe design (or Vercel, or Linear) as the design donor
2. A content-rich site (documentation, blog) as the content donor
3. The result: full multi-page site with the designer's fonts, colors, and layout applied to the new content

The app ships with 9 curated pairings and a random picker. Suggested showcase pairings:
- **Stripe → Tailwind Docs** — shows typography and card design carry-over
- **Vercel → GitHub profile** — shows layout and font system transfer

---

## CTA Direction

For beta, the primary CTA should be:
- **"Try it now"** → links to `app.kaminify.com`
- **"Start for free"** → same

No waitlist — it's live and ready. Avoid framing as "coming soon."

Secondary CTAs in nav:
- "Sign in" (existing)
- "Get started" (hero CTA)

---

## What NOT to Say

- ❌ Don't mention pricing yet (billing tier not built)
- ❌ Don't call it "alpha" or "coming soon" — it's beta
- ❌ Don't promise features not built: persistent history, design editor, team sharing, one-click deploy

---

## Technical (for SEO / footer)

### Stack
Next.js 15 · Tailwind CSS v4 · Anthropic Claude · cheerio · puppeteer-core + Browserless · Clerk auth · Supabase · Sentry · Vercel

### How the pipeline works
1. `GET /api/prepare` — scrapes both URLs, extracts design system + discovers all pages
2. `POST /api/compose` (per page) — Claude generates self-contained HTML, streamed via SSE
3. JS-rendered sites: headless Chrome captures a 512×384 JPEG screenshot passed as image blocks to Claude Sonnet (Haiku cannot process images)

### Model selection
- Demo / anonymous: **Haiku** only
- BYOK: **Haiku / Sonnet / Opus** (user-selectable in UI)
- Sites detected as JS-rendered: **Sonnet** mandatory

### Security
- API keys encrypted at rest with **AES-256-GCM** (ciphertext + IV + auth tag stored in Supabase; plaintext never persisted)
- BYOK keys passed as request headers, not stored client-side
- Server-enforced run limits for signed-in users via Supabase

---

## Repo Links

- **App:** `github.com/your-org/kaminify` (this repo)
- **Landing:** `github.com/your-org/kaminify-landing` (separate repo)
- **Live app:** [app.kaminify.com](https://app.kaminify.com)
- **Live landing:** [kaminify.com](https://kaminify.com)
