# Visual style — independent knobs, not preset clones

> Read when: starting a new project AND the user hasn't specified a visual style. Otherwise the model defaults to "Linear-clone" and every taste-saas build ends up looking the same.

The structural skill (wireless tokens, X/Y locks, 3 archetypes, DataTable first principles) gives you the **bones**. This file gives you the **skin** — and the skin is decomposed into 8 independent knobs you can mix freely. Two projects with identical bones can look completely different.

## The first move — ASK before assuming

When the user says "build me a SaaS console" without specifying a brand or vibe, **don't default to coral + 8% gray + rounded-xl** (that's the demo recipe, not the spec). Ask:

```
What visual style? You can either:
- Name a product you want it to feel like (Linear / Notion / Cal.com / Vercel / Stripe / Height / Raycast)
- Give a few words (e.g. "serious dev tool, sharp corners, no shadows")
- Let me pick a balanced one for you
```

This single AskUserQuestion (with those 3 options) costs ~10 seconds and saves you from building the wrong thing for an hour. If the user picks "let me pick", use the **default balanced combination** at the bottom of this file.

## The 8 knobs

Each knob is independent. Mixing freely is fine; that's the whole point. Real product examples are calibration anchors, not "the only valid value".

### 1. Brand hue (color wheel position, 0–360°)

The base hue determines the project's emotional tone. Pick **one** hue; never use two competing brand hues.

| Hue range | Vibe | Example products |
|---|---|---|
| 260–280° (indigo / violet) | Serious, dev-focused, "command surface" | Linear, Vercel, Raycast |
| 145–175° (green / mint / teal) | Friendly, productivity, "calm tool" | Cal.com, Height, Notion (newer accents) |
| 200–240° (blue) | Enterprise, trustworthy, ubiquitous | Stripe, Slack, GitHub |
| 0–35° (red / coral / orange) | Energetic, consumer-leaning, attention | Asana (coral), HubSpot (orange) |
| 30–60° (amber / yellow) | Warm, document-y | Notion (older coral), Roam |
| Neutral (no hue) | Maximally generic, "minimal" | Plain shadcn defaults, Carbon design |

### 2. Brand saturation (0–80%)

| Saturation | Vibe |
|---|---|
| 0–20% (near-grayscale) | Editorial, minimal, "almost no brand color" (Notion's brand is barely there) |
| 20–50% (muted) | Mature, calm (Linear's purple, Stripe's blue) |
| 50–80% (saturated) | Energetic, modern startup (Cal.com mint, Raycast red) |
| 80%+ | DON'T — looks AI-generated, hurts long sessions |

`oklch(L 0.0–0.2 hue)` for muted, `oklch(L 0.15–0.25 hue)` for saturated. NEVER `oklch(L 0.3+ hue)`.

### 3. Stage tint (does the sidebar/stage have a different bg from the card?)

| Choice | Effect | Example |
|---|---|---|
| **Strong stage tint** (`--bg-sidebar` ~ 8% darker than `--bg`) | Card visibly floats on a gray plane | Linear, Vercel dashboard, LangSmith |
| **Weak stage tint** (~2–3% gap) | Almost-flat, but card still has a hairline | GitHub, Notion |
| **No stage tint** (`--bg-sidebar` = `--bg`) | Sidebar dissolves into card; only the card border separates them | Notion's plain mode, Linen-style apps |

When in doubt, pick strong — it's the most "tasty SaaS" signature.

### 4. Surface contrast (luminance gap between adjacent layers)

| Gap | Vibe |
|---|---|
| 2–4% | Subtle, minimal hairline ladder |
| 4–8% | Standard "floating card" feel (most products) |
| 8–12% | Strong tray-on-page (heavy shadow apps, mobile-feel) |

This sets `--bg`, `--bg-sidebar`, `--bg-surface`. The skill non-negotiable says ≥4%; pick within 4–10%.

### 5. Radius scale (0–16px)

| Range | Vibe | Example |
|---|---|---|
| 0–2px (sharp) | Editorial, minimal, "I trust this" | Notion, Linen, Hex |
| 4–6px (soft sharp) | Default modern (most shadcn) | Vercel, Stripe |
| 8–12px (rounded) | Friendly, app-like | Linear, Height, Raycast |
| 14–20px (extra rounded) | Consumer, playful | Cal.com, Pitch, Loops |

Set ONE radius scale, then derive: `--card-radius` (the big surface) + `--inner-radius = card-radius - 4px` (chips, pills). Don't mix sharp cards with rounded buttons.

### 6. Type stack (the typographic personality)

**Safe default for ALL archetypes: Inter sans-only + JetBrains Mono.** Both are free Google Fonts, render well at 12–16px, and don't read as "AI generic" the way the OS default `system-ui` does. Reach beyond this only when the project asks for a specific personality — and even then, swap ONE family, not all three.

| Role | Safe default | When to swap |
|---|---|---|
| Body (`--font-sans`) | **Inter** | Almost never. Inter is the SaaS lingua franca. |
| Display (`--font-display`) | **Inter** (same as body — sans-only is fine) | Swap to **Instrument Serif** for editorial / doc / wiki vibe (Notion-feel, Linear's `font-display`, Cron). Swap to **Cal Sans** for friendly consumer feel. Don't go more exotic without a strong brief. |
| Mono (`--font-mono`) | **JetBrains Mono** | Swap to **Geist Mono** if the rest of the app uses Geist. Stay mono-tabular for any IDs / counts / timestamps regardless. |

**Why these specifically:**
- **Inter** has the widest weight/feature coverage of any free font (`cv11` numeric variants, `ss01` alt 'a', tabular-nums) and reads cleanly at 12–14px where SaaS lives.
- **JetBrains Mono** has clear character disambiguation (zero with slash, distinct l/I/1) and proper tabular figures.
- **Instrument Serif** is the modern free choice for serif display — light, sharp, calmer than Playfair, more contemporary than Garamond.
- **Cal Sans** is rounded but professional — feels like consumer SaaS without becoming a marketing site.

**Render quality gotchas — these are usually why fonts "look wrong":**

1. **Forgot to mount the Google Font.** In Next.js: `import { Inter } from "next/font/google"`, create `const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })`, then `<body className={inter.variable}>`. Missing any step → fallback to system serif/sans → "ugly".
2. **No `font-feature-settings` set.** Inter without `'cv11'` (single-storey 'a' alt) reads more "default" than intentional. For numeric-heavy archetypes (D), add `'tnum' 1` globally on `<table>` so digits align column-wise.
3. **No `-webkit-font-smoothing: antialiased`.** Mac Chrome renders fonts heavier without this; the result looks like a font 50 weights too bold.
4. **Wrong `font-display`.** Use `swap` (Google Fonts default) for body, `optional` only if you're FOUT-gating the whole page.
5. **Body size 14px, but line-height left at browser default 1.2.** SaaS body needs ~1.5 line-height — declare `line-height: 1.55` on `<body>` once.

**Universal CSS recipe (paste into `globals.css`):**

```css
:root {
  --font-sans: var(--font-inter), system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-display: var(--font-inter), system-ui, sans-serif;   /* OR --font-instrument-serif for editorial */
  --font-mono: var(--font-jetbrains-mono), ui-monospace, "Cascadia Mono", Menlo, monospace;
}

body {
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.55;
  font-feature-settings: "cv11", "ss01";   /* Inter alt 'a' + better numerals */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

/* Tabular numerals on every numeric surface — without this, columns wobble */
table, .tabular-nums {
  font-variant-numeric: tabular-nums;
}
```

**Per-archetype default body size** (the only knob that varies):
- A (Linear / dense) : `14px`
- B (Vercel / flush) : `14px`
- C (Notion / doc) : `15–16px` (reading-forward)
- D (Stripe / data) : `13px` (max density)


### 7. Density (row height baseline)

| `--row-h` | Vibe | Example |
|---|---|---|
| 24px | Hyper-dense, "spreadsheet" | Hex, Linear (compact) |
| 28px (default) | Standard SaaS console | Linear, Vercel, most products |
| 32px | Comfortable, doc-forward | Notion, Cal.com |
| 36px+ | Touch-friendly / consumer | Many mobile-first SaaS |

Density cascades — denser row = denser everything (toolbar chip, table cell pill, all `h-7` in the demo become whatever you pick).

### 8. Shadow philosophy

| Choice | Effect | Example |
|---|---|---|
| **None** (`--shadow-card: none`, rely on border + bg contrast) | Maximally flat, "minimal" | Notion, plain shadcn |
| **Faint** (`0 1px 0 0/3%, 0 4px 12px -4px 0/8%`) | Default tasty SaaS | Linear, Vercel |
| **Lifted** (`0 10px 30px -10px 0/15%`) | App-feel, consumer | Cal.com, Pitch |
| **Heavy / colored** (brand-tinted shadow) | Bold marketing-adjacent | Avoid for serious SaaS |

## Combination archetypes (anchors, not rules)

If the user just says "let me pick", reach for one of these balanced combos. Each is **one valid configuration**, not the only way:

### Archetype A — "Serious dev tool" (Linear / Raycast feel)
- Hue 260°, saturation 30% → muted indigo brand
- Strong stage tint (8% gap), 6% surface contrast
- Radius 10px, faint shadow
- Inter / Geist sans only, JetBrains Mono brand mark
- `--row-h: 28px`

### Archetype B — "Editorial doc / wiki" (Notion / Linen feel)
- Hue 30° (warm) or neutral, saturation 10%
- Weak stage tint (2% gap), 4% surface contrast
- Radius 4px, no shadow (rely on hairline)
- Serif display + sans body, mono for code blocks
- `--row-h: 32px` (more breathing room)

### Archetype C — "Friendly consumer SaaS" (Cal.com / Height feel)
- Hue 165° (mint) or 280° (violet), saturation 60%
- Strong stage tint, 6% surface contrast
- Radius 14px, lifted shadow
- Cal Sans / similar rounded display + Inter body
- `--row-h: 32px`

### Archetype D — "Enterprise / financial" (Stripe / Plaid feel)
- Hue 220° (blue), saturation 40%
- Weak stage tint, 4% surface contrast
- Radius 6px, faint shadow
- Sans only, neutral
- `--row-h: 28px`

### Default balanced (when user says "you pick")

Reach for **Archetype A** — it's the safest "tasty SaaS console" and the demo references happen to use it. Just don't say "I'm making Linear"; say "indigo muted, faint shadows, 28px rows, sans display".

## Anti-patterns

- **Copying ALL knobs from one product.** Pick hue from one, density from another, shadow philosophy from a third. Independent knobs.
- **Going saturated (oklch chroma ≥ 0.25) on the brand color.** Reads as AI-generated. Cap at 0.2.
- **Mixing radius scales** (sharp cards + rounded buttons). Pick one scale, derive inner radii.
- **Two competing brand hues.** ONE brand color. Semantic colors (success / warning / danger) are not brand; they have their own muted hues.
- **Skipping the ask.** If the user said "build me a SaaS console" without a brand/vibe hint, ask before defaulting. The cost is 10 seconds; the cost of getting it wrong is an hour rebuilding.

## Mechanical note — same token NAMES, different VALUES

Every knob above sets values for tokens whose **names are fixed by the skill contract**:

```css
--brand          /* knob 1 + 2 */
--brand-hover    /* derived: same hue, -6% lightness */
--brand-subtle   /* derived: same hue, very light */
--brand-fg       /* contrast color for brand bg, AA-compliant */
--bg             /* knob 4 */
--bg-sidebar     /* knob 3 + 4 */
--bg-surface     /* knob 4 */
--card-radius    /* knob 5 */
--font-sans, --font-display, --font-mono  /* knob 6 */
--row-h          /* knob 7 (cascades to --top-row-h, --row-gap-y proportionally) */
--shadow-card    /* knob 8 */
```

Other components (DataTable, Sidebar, Modal, Sheet, etc.) consume these tokens — they don't care which knob value you picked. Change a knob, the whole app shifts visually without code changes.
