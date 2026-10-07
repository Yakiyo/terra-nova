# TerraNova design system: Mission control

Read this before changing anything in `web/`. The tokens live at the top of
`web/styles.css`; use them instead of raw values.

## 1. Visual theme and atmosphere

A calm instrument for scientists and judges, not a sci-fi poster. The interface is
quiet and precise; the **data and the planets carry the colour** (the globe, the score
heat map, the Moon and Mars). One accent, NASA red, marks what is selected or what
to do next. Depth comes from the 3D scenes, not from glows or glass.

## 2. Colour palette and roles

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#06090F` | Page background (tinted near-black, never `#000`) |
| `--surface` | `#0C1119` | Sidebar, cards, dialogs |
| `--surface-2` / `--surface-3` | `#121926` / `#18212F` | Hover and pressed fills, nested rows |
| `--overlay` | `rgba(9,13,20,.9)` | Panels that sit over a live 3D canvas |
| `--line` / `--line-2` | `#1E2733` / `#2B3644` | Hairlines; `--line-2` for control borders |
| `--ink` / `--ink-2` / `--ink-3` | `#EEF0F3` / `#B4BCC7` / `#8591A0` | Text: primary, secondary, tertiary (all pass 4.5:1 on `--surface`) |
| `--accent` | `#E03C31` | NASA red: active tab, selection, the brand dot, focus of attention |
| `--accent-btn` | `#C9342A` | Filled buttons (white text 5.2:1); hover `#B22C24` |
| `--score` | `#F08A4B` | Match scores and their bars: the colour of the score heat map |
| `--tool` | `#7CB7FF` | Measuring tools only: probe, profile, pinned sites |
| `--ok` / `--warn` | `#3FB68B` / `#E8B04B` | Status. Errors use the accent with an icon and a word, never colour alone |

Data ramps (`web/colors.js`) are part of the science, not the chrome: do not restyle them.

## 3. Typography

| Role | Family | Size / weight | Notes |
|---|---|---|---|
| Display (page titles, site names in God's Eye) | Barlow Condensed | 26-78 px / 700 | Sentence case, tight leading (0.95-1.05) |
| Brand and main nav | Barlow Condensed | 15-21 px / 600-700 | The only uppercase text, tracking 0.06em |
| Body and UI | IBM Plex Sans | 13-14 px / 400-600 | Sentence case everywhere |
| Numbers, coordinates, code, kbd | IBM Plex Mono | 11-46 px / 400-500 | Tabular figures; scores, percentages, metres |

- Nothing below 11 px; small body text is 12 px.
- Fonts are vendored in `web/vendor/fonts` (OFL), so offline demos look identical.
- No em-dashes in copy. Use a comma, a colon or a middle dot.

## 4. Components

- **Buttons:** primary = solid `--accent-btn`, white label, one line; secondary = 1 px
  `--line-2` hairline. Radius 8 px, height 34 px (30 px small, 44 px on Home). Every
  button has hover, active (1 px press), disabled and focus states.
- **Icon buttons:** 36 × 36 px, Phosphor icon from `web/icons.svg` via `icon(name)` in
  `web/ui.js`. Never emoji or Unicode arrows as icons. One deliberate exception (team
  choice): known analog sites are marked with a rocket emoji on the map, in the legend and
  in the Explore scatter, and God's Eye marks the site with a red map pin.
- **Headings over sections:** a real `h2`/`h3` at 13 px semibold. No uppercase
  eyebrows, no numbered kickers.
- **Lists of results:** rows divided by hairlines, not cards inside cards.
- **Notices:** tinted `--surface-2` box with an info icon; no coloured side borders.
- **Toasts:** `toast(message, kind)` from `web/ui.js`; `info` and `success` auto-hide,
  `error` stays until dismissed.
- **Map overlays** (toolbar, legend, twin globe, info card): `--overlay` with an 8-10 px
  backdrop blur. This is the only place blur is allowed, because text sits on a moving
  3D scene.

## 5. Layout

- 4 px spacing scale; more space above a heading than below it.
- Body text measure 70ch at most.
- Finder: 360 px sidebar (320 px under 1280 px) + map; stacked under 1020 px.
- Radii: 4 px (inputs, tags), 8 px (buttons, panels), 12 px (cards, dialogs).

## 6. Depth and elevation

One shadow token, `--shadow` (8 px offset, 16 px blur). Flat surfaces otherwise.
No glows, no gradient text, no chamfered `clip-path` shapes.

## 7. Motion

| Token | Value | Use |
|---|---|---|
| `--ease` | `cubic-bezier(0.16, 1, 0.3, 1)` | Every entrance and state change |
| `--t-fast` | 150 ms | Hover, press, colour changes |
| `--t-state` | 250 ms | Tabs, list and detail, toasts, dialogs |
| `--t-view` | 400 ms | Page transitions, God's Eye, the Home entrance |

- Animate `transform` and `opacity` only. Exits are faster than entrances.
- Page to page: View Transitions (`@view-transition`), the top bar stays put.
- Lists stagger only when a new ranking arrives (capped at 12 rows).
- The comets are the only decorative loop. Everything collapses to instant under
  `prefers-reduced-motion`, and the Home globe stops turning.

## 8. Do and don't

**Do:** show real numbers from the API with their units; keep one accent; use icons
from the sprite; write labels as actions ("Open in God's Eye 3D", "Download these sites").

**Don't:** add a second accent colour, neon glows, glassmorphism on page chrome,
uppercase body text, emoji icons, invented numbers, or "Elevate / Seamless / Unleash" copy.

## 9. Responsive behaviour

| Width | Change |
|---|---|
| ≤1360 px | Land-cell chip hidden |
| ≤1280 px | Sidebar 320 px; toolbar labels shorten |
| ≤1200 px | Top-bar buttons become icon-only |
| ≤1020 px | Map above the sidebar; legend and twin globe compact; God's Eye panel becomes a bottom sheet |
| ≤720 px | Search narrows, twin globe 112 px, single-column cards |

## 10. Prompt guide for AI agents

"Follow DESIGN.md. Use the tokens in `web/styles.css`, icons via `icon()` from
`web/ui.js`, and toasts via `toast()`. One accent (NASA red); scores use `--score`.
Sentence case, no em-dashes, nothing under 11 px. Animate transform and opacity with
`--ease` and respect reduced motion. Run `node scripts/ui_smoke.mjs` and
`npx impeccable detect web/` before committing."
