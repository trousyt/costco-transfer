# Handoff: Costco Cart Transfer — Chrome Extension Popup

## Overview
A Chrome extension that transfers a shopper's **Instacart** cart to **Costco Same-Day** (`sameday.costco.com`). This package documents the **design system** and the **popup UI** (the panel that opens when the user clicks the extension's toolbar icon). It covers the brand mark/icon, color tokens (light + dark), typography, spacing, and every component and state.

## About the Design Files
The files in this bundle are **design references created in HTML/CSS** — prototypes showing the intended look and behavior. They are **not** production code to ship as-is. The task is to **recreate these designs in the extension's codebase** using its established patterns (vanilla JS + CSS, React, Preact, Svelte, etc.). If no framework is set up yet, a Chrome extension popup is small and self-contained — **vanilla HTML/CSS/JS or Preact** are both excellent choices. The popup renders at a fixed width inside the browser's popup chrome (no responsive breakpoints needed).

Bundled files:
- `Design System.html` — the documented system (tokens, type, components, icon set). Reference for *values*.
- `Bold Popup.html` — the working popup with all states + a live tweaks panel. Reference for *layout & behavior*. **Note:** the tweaks panel (`tweaks-panel.jsx` + the trailing `<script>` block) is a design-tool affordance for exploring options — **do not port it.** Ship the popup with one resolved set of token values (see "Resolved defaults" below).
- `tweaks-panel.jsx` — included only so `Bold Popup.html` opens without errors. Ignore for implementation.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, and interactions. Recreate pixel-accurately. All colors are given in **oklch** (as authored) — modern Chrome (the only target) supports `oklch()` natively, so you can use them verbatim, or convert to hex/RGB if you prefer.

---

## Resolved defaults (ship these)
The popup supports a light and a dark theme; the **shipping default chosen by the designer** is:
- **Theme:** Light
- **Accent (primary action):** Crimson `#CB3A3A` (overrides `--coral` for the primary button + ready-state edge)
- **Header fill:** Amber gradient
- **Route line:** Visible (`Instacart → Costco Same-Day` under the title)
- **Density:** Compact
- **Corner radius:** `7px` base (`--r`)

Still ship the dark-theme token set (below) behind `prefers-color-scheme` or a manual toggle — the system is built for both — but light/compact/crimson/7px is the default.

---

## Popup shell
- **Width:** `380px` fixed. Height is content-driven (Chrome popups auto-size; cap ~600px and let history scroll if longer).
- **Font:** `-apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif` (a neutral grotesque). Monospace for figures/labels: `ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, monospace`.
- **Outer radius:** `var(--r)` (13px design baseline; 7px shipping default).
- **Structure top→bottom:** Header bar → Status block → Action buttons → Past-transfers history → Clear-history.

---

## Screens / Views
The popup is a **single view** that changes by **state**. There are 5 states, driven by what's happening on the page and the transfer lifecycle.

### State 1 — Waiting (no Same-Day tab) — *default empty state*
- **Purpose:** Tell the user to open a Costco Same-Day tab before transferring.
- **Status block:** `s-info` variant. Amber left-edge (3px). Small amber info glyph in a tinted tile. Kicker `ACTION NEEDED`, title **"Open a Same-Day tab"** + muted "to begin a transfer."
- **Actions:** "Open Sameday" is **promoted to the primary button** (filled). "Transfer cart" is **disabled**. "Clear Instacart cart" is a secondary outline.
- **Header route dot:** amber/warn colored (not yet live).

### State 2 — Ready (cart detected)
- **Purpose:** A cart was found; show the haul and let the user transfer.
- **Status block:** `s-ready` variant — the **hero**. Coral left-edge. Kicker `CART READY`. Big number (e.g. `30`) at 27px/700, with " items · $148.20" beside it (muted). Sub-line: **"28 matched"** (bold) "· 2 need review" (muted).
- **Actions:** Primary = **"Transfer cart to Same-Day"** (filled, leading swap icon). Below it a split row: "Open Sameday" + "Clear Instacart cart" (both secondary outline).
- **Header route dot:** green/live.

### State 3 — Transferring (in progress)
- **Status block:** `s-progress`. Amber edge. Kicker `TRANSFERRING`, title "Adding item **18 of 30…**", then a 6px progress track with amber→amber-deep fill at the current %.
- **Actions:** Primary button shows a busy/disabled state while running (your call — e.g. disabled with "Transferring…").

### State 4 — Done (complete)
- **Status block:** `s-done`. Green edge. Green check glyph. Kicker `TRANSFER COMPLETE`, title "30 added" + muted "· 0 skipped · 0 failed".
- **Actions:** Primary becomes "Open Costco cart" (or similar) — optional, designer's call.

### State 5 — Error (e.g. sign-in needed)
- **Status block:** `s-error`. Coral/red edge. Red warning glyph. Kicker `CAN'T CONTINUE`, title "Sign in to Costco" + muted "to transfer your cart." Use for any blocking error (not signed in, network, etc.).

---

## Components (exact specs)

### Header bar (`.ph`)
- Background: **amber gradient** `linear-gradient(118deg, var(--amber), var(--amber-deep))`. **Constant across light/dark themes** — this is the brand signature.
- Padding: `14–15px 15–16px`. Top corners match `var(--r)`.
- Row 1: icon mark (28–30px, "Inverse" variant = white disc + accent arrows) + wordmark **"Costco Cart Transfer"** (15px/700, `-0.01em`, white, `white-space:nowrap`).
- Row 2 (route, toggleable): 11px, `rgba(255,255,255,0.9)`, indented to align under the wordmark. A 7px live dot (white when live; warn-colored when waiting) + `Instacart → Costco Same-Day`.

### Status block (`.status`)
- Container: `1px solid var(--line)`, `background var(--surface)`, radius `calc(var(--r) - 2px)`, padding `13px 14px` (compact: `10px 12px`), `position:relative; overflow:hidden`.
- **Left edge:** `::before`, 3px wide, full height. Color by state: info/progress = `--amber`, ready = `--coral`(accent), done = `--ok`, error = `--bad`.
- Optional leading glyph tile (`.st-ico`): 30px, radius 8px, background = `color-mix(in oklch, <state-color> 18%, transparent)`, with a 16px stroke icon in the state color.
- Kicker (`.st-kicker`): mono 9.5px, `0.1em`, uppercase, `--muted`.
- Title (`.st-title`): 13.5px/600 `--ink`; trailing muted text uses `.lo` (`--muted`, weight 500).
- Hero (ready): `.st-hero .big` = 27px/700 `-0.02em`; `.cur` = 13px/600 `--muted`. `.st-sub` = 12px `--muted`, bold spans in `--ink`.
- Progress track (`.st-track`): height 6px, radius 4px, `background var(--surface-2)`; fill (`.st-fill`) `linear-gradient(90deg, var(--amber), var(--amber-deep))`.

### Buttons (`.btn`)
Base: font 13.5px/600, radius `calc(var(--r) - 3px)`, padding `12px 14px` (compact `10px 13px`), `inline-flex` centered, `gap 8px`, `white-space:nowrap`.
- **Primary** (`.btn-primary`): `background linear-gradient(118deg, var(--coral), var(--amber-deep))`, color `#fff`, `box-shadow: 0 10px 22px -12px var(--coral), inset 0 1px 0 rgba(255,255,255,0.12)`. Hover: `filter: brightness(1.06)`. *(With the crimson default, `--coral` = `#CB3A3A`, so the primary reads crimson→amber.)*
- **Secondary** (`.btn-secondary`): transparent, `color var(--ink)`, `box-shadow: inset 0 0 0 1.5px var(--line)`. Hover: border → `--muted`.
- **Ghost** (`.btn-ghost`): transparent, `color var(--muted)`, weight 500. Hover: `color var(--ink)`, `background var(--surface)`. (Used for "Clear history".)
- **Danger** (`.btn-danger`): transparent, `color var(--bad)`, `box-shadow: inset 0 0 0 1.5px color-mix(in oklch, var(--bad) 36%, transparent)`. Hover: `background color-mix(in oklch, var(--bad) 12%, transparent)`.
- **Disabled** (`[disabled]`): `opacity 0.4`, `cursor not-allowed`, neutral outline, no fill/glow.
- Layout: primary is full-width on its own row; secondaries share a split row (`display:flex; gap:9px;` each `flex:1`).

### History row (`.hrow`)
- Container: `display:flex; gap:11px`, `background var(--surface)`, `1px solid var(--line-soft)`, radius `calc(var(--r) - 2px)`, `padding: 11px 13px 11px 0`, `overflow:hidden`.
- **Status edge** (`.hbar`): 3px, full height, right-rounded. `ok`=`--ok`, `warn`=`--warn`, `bad`=`--bad`.
- Top line: date·time `.hwhen` (13px/600 `--ink`) + status **pill** `.hpill` (mono 9px, uppercase, `0.06em`, radius 20px, padding `3px 7px`; text = state color, bg = `color-mix(in oklch, <state> 16–18%, transparent)`). Pills: `Success` (ok), `All skipped` (warn), `Failed` (bad).
- Stats line (`.hstats`, `gap 14px`): three `.stat` items "N added / N skipped / N failed". Number `b` = mono 12.5px/600 colored by metric (added=`--ok`, skipped=`--warn`, failed=`--bad`); label = 11.5px `--faint`. **Zero values:** render the number in `--faint` (dimmed) instead of the metric color so non-zero counts pop.

### Section label / "Past transfers" header
- `.hist-head h3`: 12px/700, `0.04em`, uppercase, `--muted`. Right-aligned count in mono 11px `--faint`.

---

## Interactions & Behavior
- **Open Sameday** → opens/focuses a `sameday.costco.com` tab. When such a tab exists + a cart is parsed, transition Waiting → Ready.
- **Transfer cart** (enabled only in Ready) → iterate items, add each to the Costco Same-Day cart; drive the progress state (item i of N); on finish → Done. On a blocking failure (e.g. not signed in) → Error.
- **Clear Instacart cart** → clears the parsed source cart (confirm if destructive).
- **Clear history** → empties the past-transfers list (confirm).
- **Hover states** as specified per button above. Transitions: `filter/background/border-color .12s ease`.
- **Reduced motion:** progress fill may animate width; gate any non-essential motion on `prefers-reduced-motion`.
- No responsive breakpoints — fixed 380px popup.

## State Management
- `appState`: `'waiting' | 'ready' | 'transferring' | 'done' | 'error'`.
- `cart`: `{ items: [{name, price, qty, matchStatus: 'matched'|'similar'|'unavailable'}], subtotal, matchedCount, reviewCount }`.
- `progress`: `{ current, total }` during transfer.
- `history`: `[{ when: ISO, status: 'success'|'skipped'|'failed', added, skipped, failed }]` — persist in `chrome.storage.local`.
- `theme`: `'light' | 'dark'` (default light; optionally follow `prefers-color-scheme`).
- Derive button enablement + which status variant to render from `appState`.

---

## Design Tokens

### Accent & status (theme-independent)
| Token | oklch | Use |
|---|---|---|
| `--amber` | `oklch(0.74 0.160 56)` | header gradient start, info/progress edge, progress fill |
| `--amber-deep` | `oklch(0.61 0.170 45)` | header gradient end, button gradient end |
| `--coral` | `oklch(0.67 0.180 30)` | **accent** — primary button, ready edge. *Shipping override: `#CB3A3A` (crimson).* |
| `--ok` (dark) | `oklch(0.74 0.130 158)` | success — added, done |
| `--ok` (light) | `oklch(0.55 0.125 152)` | success on light bg |
| `--warn` (dark) | `oklch(0.80 0.140 78)` | skipped |
| `--warn` (light) | `oklch(0.60 0.130 66)` | skipped on light bg |
| `--bad` (dark) | `oklch(0.66 0.185 28)` | failed, error |
| `--bad` (light) | `oklch(0.58 0.180 28)` | failed/error on light bg |
| on-amber text | `#ffffff` | header + primary label |

### Neutrals — DARK theme
| Token | oklch |
|---|---|
| `--bg` | `oklch(0.185 0.010 65)` |
| `--surface` | `oklch(0.225 0.012 65)` |
| `--surface-2` | `oklch(0.255 0.013 65)` |
| `--ink` | `oklch(0.965 0.004 80)` |
| `--muted` | `oklch(0.66 0.012 70)` |
| `--faint` | `oklch(0.50 0.012 70)` |
| `--line` | `oklch(0.31 0.012 65)` |
| `--line-soft` | `oklch(0.27 0.012 65)` |

### Neutrals — LIGHT theme (shipping default)
| Token | value |
|---|---|
| `--bg` | `#ffffff` |
| `--surface` | `oklch(0.975 0.006 75)` |
| `--surface-2` | `oklch(0.945 0.008 75)` |
| `--ink` | `oklch(0.255 0.014 60)` |
| `--muted` | `oklch(0.52 0.014 62)` |
| `--faint` | `oklch(0.63 0.012 65)` |
| `--line` | `oklch(0.89 0.010 70)` |
| `--line-soft` | `oklch(0.925 0.008 72)` |

### Spacing (base ≈ 4px)
`4 · 8 · 11 · 14 · 16 · 24` — used for padding & gaps. Compact density trims popup section padding to ~`10–14px`.

### Radius (`--r` baseline 13 / ship 7)
Nested by ~2px: shell `var(--r)` · card `calc(var(--r) - 2px)` · button `calc(var(--r) - 3px)` · icon tile `8px` · pill `999px`.

### Typography scale
| Role | size / weight | tracking | family |
|---|---|---|---|
| Hero | 27 / 700 | -0.02em | sans |
| Wordmark | 15 / 700 | -0.01em | sans |
| Title | 13.5 / 600 | — | sans |
| Body | 13 / 500–600 | — | sans |
| Caption | 12 / 500 | — | sans |
| Figure | 12.5 / 600 | — | **mono** |
| Kicker | 10.5 / — | 0.1em, uppercase | **mono** |
| Label / pill | 9–9.5 / — | 0.06em, uppercase | **mono** |

### Elevation
- Resting (cards/rows): `0 1px 2px rgba(40,30,15,0.06)`
- Floating popup (light): `0 0 0 1px var(--line), 0 18px 42px -26px rgba(40,30,15,0.26)`
- Floating popup (dark): `0 0 0 1px var(--line-soft), 0 24px 50px -26px rgba(0,0,0,0.6)`
- Action glow (primary): `0 10px 22px -12px var(--coral)`

---

## Assets — Extension icon
The mark is two arrows whose **inner arms merge into one continuous diagonal** through the center (a single "transfer" hand-off). Authored on a 32×32 viewBox. Generate manifest PNGs at **16, 32, 48, 128**; increase stroke weight at 16px for legibility.

**Primary (coral/accent disc):**
```svg
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="16" r="16" fill="#CB3A3A"/>
  <g fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 6 21.5 11 8.5 11"/>
    <path d="M21.5 11 10.5 21"/>
    <path d="M16 26 10.5 21 23.5 21"/>
  </g>
</svg>
```
- At 16px, use `stroke-width="3"`.
- **Inverse** variant (used in the header): white disc `fill="#fff"`, arrows `stroke` = accent.
- Manifest mapping: `"icons": { "16": ..., "32": ..., "48": ..., "128": ... }` and an `"action": { "default_icon": {...} }`.
- Toolbar icon reads well on both light and dark browser chrome (the disc provides its own contrast).

## Files (in this bundle)
- `README.md` — this document (self-sufficient; implement from this alone).
- `Design System.html` — visual reference for all tokens, type, components, and the icon set.
- `Bold Popup.html` — the popup with all 5 states + (ignore) the tweaks panel.
- `tweaks-panel.jsx` — dependency of the prototype only; do not port.
