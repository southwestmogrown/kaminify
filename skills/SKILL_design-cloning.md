# Skill: Design Cloning Prompt Iteration

## When To Use This Skill

When working on the extraction → composition pipeline to improve how faithfully
the cloned output reproduces the donor site's design. This includes:
- Adding new extraction fields to DesignSystem or PageContent
- Modifying the composer SYSTEM_PROMPT
- Changing RAW_CSS_LIMIT or other token budget constants
- Adding new CSS property extractors
- Evaluating whether a change actually improves output quality

This skill does NOT replace the bug-fix skill for isolated bugs. It governs
the ongoing iteration loop for the cloning quality problem.

---

## The Fundamental Problem

The pipeline passes information about the donor site to Claude in several stages.
At each boundary, information is lost or distorted. The goal is to minimize
loss at every boundary — not just add more data, but add the RIGHT data.

---

## Information Loss Taxonomy

### Boundary 1: `scraper.ts` → `ScrapedSite`
**What it keeps:** HTML (scripts/noscript stripped), concatenated CSS, page title, jsRendered flag
**What it loses:** `<base href>` resolved URLs, character encoding issues, DOM state

### Boundary 2: `ScrapedSite` → `DesignSystem` (extractor.ts)
**What is passed:**

| Field | How extracted | Limit | What is lost |
|---|---|---|---|
| `cssVariables` | Regex `:root\s*\{([^}]*)\}` | No limit | Nested `:root {}`, malformed blocks |
| `colorPalette` | hex/rgb/hsl regex | 20 colors | `currentColor`, gradient stops, CSS variable references |
| `fontStack` | `font-family:` regex | No limit | Which font is primary vs fallback, no sizes |
| `spacing` | margin/padding regex | 20 values | No breakpoint awareness |
| `borderRadius` | `border-radius:` regex | 10 values | None significant |
| `componentPatterns.{nav,hero,footer,card,button}` | cheerio `$.html(el)` | 2500 chars each | **All CSS rules targeting these elements** |
| `rawCss` | Full concatenated CSS | 8000 chars before Claude | Layout rules (grid, flexbox, positioning) |
| `webFontUrl` | Google Fonts link/@import | 1 URL | Self-hosted @font-face, Typekit, Bunny CDN |

**What is NOT extracted at all:**
- `background-image`, `linear-gradient`, `radial-gradient` values
- `box-shadow`, `text-shadow` values
- h1–h6 font-family/font-size pairs (typographic hierarchy)
- CSS rules matching component HTML class/id selectors

### Boundary 3: `DesignSystem` → Claude (composer.ts)
**What the SYSTEM_PROMPT instructs vs what the data actually provides:**

| Prompt instruction | Actual data available | Gap |
|---|---|---|
| "Apply design tokens" | `cssVariables` (may be empty) | Tokens may not exist on non-CSS-variable sites |
| "Use component patterns" | HTML with classes but no CSS rules | Model sees unstyled HTML |
| "Inject webFontUrl" | Only Google Fonts URLs | Non-Google font sites fall back to system stacks |
| "Replicate typography" | Unordered `fontStack[]` with no sizes | Model cannot distinguish h1 from body text |
| "Apply layout feel" | 8000 chars of raw CSS | Grid/flexbox rules likely outside the window |

### Boundary 4: `ScrapedSite` → `PageContent` (extractor.ts)
**What is lost:** ALL HTML structure. Content arrives as flat arrays:
- `headings: string[]` — no hierarchy (which h1 does an h2 belong to?)
- `paragraphs: string[]` — no semantic grouping, truncated at 20
- `imageAlts: string[]` — zero actual image data (no src, no dimensions)
- No tables, blockquotes, code blocks, or figures
- `discoverPages` overrides page title with navLabel

---

## Iteration Loop

### Step 1 — Identify the gap
Use real donor → content URL pairs. Run the pipeline. Inspect the output.
Classify what's missing:
- No colors / wrong colors → colorPalette or cssVariables gap
- Default fonts → webFontUrl or fontStack gap
- Flat/ugly layout → rawCss truncation or missing layout CSS
- Missing sections → PageContent extraction gap
- Wrong nav structure → componentCss for nav gap

### Step 2 — Make the smallest possible fix
Prefer adding a new extraction function over modifying existing logic.
Keep backward compatibility — new DesignSystem fields should be optional.

### Step 3 — Validate with test cases
Use the canonical URL pairs below. Run the full pipeline end-to-end.
Evaluate each output against the checklist in Step 4.

### Step 4 — Evaluate output quality
Check each cloned page for:
- [ ] Donor site fonts visible (check heading and body)
- [ ] Donor site color palette represented (accent colors, backgrounds)
- [ ] Navigation present and linking to all discovered pages
- [ ] All content sections present (no paragraphs missing)
- [ ] Headings have correct hierarchy (h1 > h2 > h3 structure)
- [ ] Background effects (gradients, images) present if donor had them
- [ ] Box shadows or elevation on cards/buttons if donor had them
- [ ] No invented content (Claude did not add text not in the source)
- [ ] Self-contained HTML (no external CSS/JS links)

### Step 5 — Log the iteration
Update DEVLOG.md with:
- What was changed and why
- Which test URL pair was used
- Before/after observations
- What still needs work (the next known gap)

---

## Canonical Test URL Pairs

Use these for all extraction/composition experiments:

| Tier | Design URL | Content URL | What it tests |
|---|---|---|---|
| Simple (1–2 pages) | Stripe (stripe.com) | A simple blog or docs site | Color/font extraction, minimal nav |
| Medium (3–5 pages) | Vercel (vercel.com) | An open-source GitHub project | Multi-page nav discovery, layout complexity |
| Complex (5+ pages) | Tailwind Docs (tailwindcss.com) | A documentation site | CSS-heavy design, typography hierarchy |

**For gradient/shadow testing:**
| Design URL | Content URL | What it tests |
|---|---|---|
| Linear (linear.app) | Any | Heavy use of gradients, subtle shadows |
| Figma (figma.com) | Any | Dark theme, glassmorphism, complex elevation |

---

## Key Constants and Their Safe Ranges

| Constant | Current | Safe range | Why it matters |
|---|---|---|---|
| `RAW_CSS_LIMIT` | 15000 | 8000–20000 | Controls how much raw CSS reaches Claude |
| `PATTERN_CHAR_LIMIT` | 2500 | 1500–4000 | Component HTML snippet size |
| `MAX_COMPONENT_CSS` | 1500 | 1000–3000 | Per-component CSS rules cap |
| `MAX_BACKGROUND_EFFECTS` | 10 | 5–20 | Gradient/image capture limit |
| `MAX_SHADOW_VALUES` | 10 | 5–20 | Shadow value capture limit |
| `MAX_HEADINGS` | 12 | 10–20 | Heading content cap |
| `MAX_PARAGRAPHS` | 20 | 15–30 | Paragraph content cap |

Do NOT raise limits without evidence. Larger limits → more tokens →
higher cost per compose call and risk of context overflow on complex sites.

---

## Hard Rules

**Always:**
- Read CLAUDE.md before touching any lib file
- Check what the model actually receives (log the userMessage if needed) before adding more fields
- Run the full test suite after any change (`npm run test:coverage`)
- Update DEVLOG.md after any meaningful iteration
- Validate with at least one real URL pair, not just unit tests

**Never:**
- Add a new extraction field without a corresponding instruction in the SYSTEM_PROMPT
- Raise RAW_CSS_LIMIT without understanding what CSS it will now include
- Assume CSS-variable-based design systems are the norm — many sites use raw class names
- Change extraction logic without updating composer.ts to use the new data
