---
name: TerraNova Frontier
description: Planetary storytelling and an evidence-led scientific workspace
colors:
  background: "#050507"
  surface: "#111114"
  surface-raised: "#19191e"
  surface-selected: "#26262d"
  overlay: "rgba(5, 5, 7, 0.96)"
  nasa-blue: "#0b3d91"
  action: "#d5092b"
  action-hover: "#b80726"
  accent: "#f21d38"
  ink: "#ffffff"
  ink-secondary: "#d6d6df"
  ink-muted: "#adadbb"
  line: "#303038"
  line-control: "#555560"
  score: "#ff4961"
  tool: "#7cb7ff"
typography:
  display:
    fontFamily: "Anton, sans-serif"
    fontSize: "clamp(56px, 6.8vw, 96px)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Roboto, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  support:
    fontFamily: "Panchang, Roboto, sans-serif"
    fontSize: "clamp(14px, 1.12vw, 16px)"
    fontWeight: 600
    lineHeight: 1.85
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
rounded:
  small: "4px"
  panel: "8px"
  dialog: "12px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
  page: "clamp(24px, 6vw, 96px)"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.ink}"
    rounded: "{rounded.small}"
  button-secondary:
    backgroundColor: transparent
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.small}"
  navigation:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink-secondary}"
    height: "76px"
  input:
    backgroundColor: "{colors.overlay}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  chip:
    textColor: "{colors.ink-muted}"
  destination:
    backgroundColor: transparent
    textColor: "{colors.ink}"
---

# Design System: TerraNova Frontier

## Overview

**Creative North Star: "The next frontier, here on Earth"**

User-approved replacement of the earlier Mission control identity. Omega ClearSpace inspired expansive planetary imagery, confident typography and a scrolling narrative. NASA-inspired blue, red and white connect the narrative pages to the working application.

Home tells the discovery story; Targets provides an editorial destination index. Finder and God's Eye carry the same material and type at a denser scale, with native scientific interactions. Real planetary imagery and API results provide the visual content.

**Key Characteristics:**
- Black space backgrounds and charcoal surfaces, white typography, red primary actions.
- Large image-led compositions and restrained, flat controls.
- Evidence graphics tied to datasets and accessible numbers.
- A temporary TerraNova mark until the team supplies its identity.

## Colors

Use the CSS properties in `web/styles.css`; the frontmatter records their durable values.

- `--bg`, `--surface`, `--surface-2`, `--surface-3`: black/charcoal hierarchy for pages, panels and interaction.
- `--nasa-blue`: reserved brand-blue accent; page backgrounds remain space black.
- `--accent`: selection and attention. Filled actions use darker `--accent-btn` for readable white text.
- `--ink`, `--ink-2`, `--ink-3`: primary, secondary and muted text.
- `--line`, `--line-2`: separators and control edges.
- `--score` and the analog-score ramp use the user-approved red family. Rank thresholds and opacity stay unchanged. Other scientific ramps preserve their data semantics; tools use `--tool` blue.

## Typography

Self-hosted Anton for display, Roboto for body and navigation, Panchang for feature counters and short narrative supporting text, and IBM Plex Mono for measurement, coordinates and API values. Fonts live in `web/vendor/fonts` and must work offline.

- Home display: responsive up to 96px, weight 400, tight leading and tracking.
- Narrative headings: responsive 36–64px, weight 400.
- Target and terrain titles: 21–48px depending on context.
- Narrative supporting copy: Panchang 600 at 14–16px with generous leading; working UI: Roboto at 14–16px; evidence provenance: at least 14px.
- Use sentence case, tabular numerals and readable line measures. Narrative heading emphasis is upright in secondary ink.

## Layout

Narrative pages use `--page-gutter`, shared sticky navigation and generous section spacing. Target groups pair planetary imagery with divided destination rows. Small screens become a single reading column.

Finder uses a sidebar and full-height map. Below the stacking breakpoint, the map precedes the sidebar. God's Eye uses a desktop side panel and mobile bottom sheet. Sun and climate controls use native disclosures.

Responsive breakpoints: 1280px, 1020px and 720px, with additional narrow navigation adaptations. Navigation is 76px on desktop and 68px on mobile. Finder navigation may wrap on narrow screens.

## Elevation & Depth

Depth comes from the planetary scene and measured terrain. Page surfaces remain flat. Floating map/terrain panels and search controls use overlay surfaces and backdrop blur. Menus/dialogs retain the existing shadow token. No decorative glows or gradient text.

Motion uses `--ease` with fast, state and view durations. Home/Targets use locally vendored Lenis for wheel smoothing and anchors; Home also has subtle hero parallax. Finder/God's Eye retain native map input. Reduced motion disables smoothing, parallax and decorative transitions; Home globe automatic rotation is disabled when reduced motion is set at page load.

## Shapes

Actions and selections have compact corners; tool panels/dialogs use shared radius tokens. Planetary target groups and ranked results use divided rows; custom target entries retain the card treatment. Preserve native input affordances and visible keyboard focus.

## Components

- **Navigation:** temporary SVG mark, wordmark, Home/Targets/Finder links, red active underline.
- **Actions:** red primary, hairline secondary, visible hover/pressed/disabled/focus states. Use Phosphor icons from `web/icons.svg` via `icon()`.
- **Destinations:** attributed planetary imagery and keyboard-accessible target-specific links.
- **Evidence:** horizontal bars with API similarities, values and direct dataset links. Retain units and caveats.
- **Finder:** ranked rows with graphical scores, novelty, stability, detail and exports. Preserve custom profiles and weights.
- **God's Eye:** defer WebGL allocation, paint loading before geometry, bound successful caches, guard stale requests, retain Retry/Back on unavailable data.
- **Notifications:** `toast()` from `web/ui.js`; actionable error copy with technical preparation details in a disclosure.

## Do's and Don'ts

- Do preserve offline assets, reduced motion, keyboard access and source attribution.
- Do render scientific values from the API; compute science in `src/compute`.
- Do preserve data color semantics across views.
- Do verify desktop/mobile layouts and run `node scripts/ui_smoke.mjs` after changes.
- Don't invent scores, statistics, missing data or a final TerraNova logo.
- Don't add CDN runtime dependencies or smooth scrolling over map controls.
- Use the approved space-black system consistently across routes; do not restore the blue surface palette or discarded Barlow display hierarchy.

## Navigation and evidence motion

Targets accepts `?body=moon` and `?body=mars`; legacy `#Moon` and `#Mars` also
select planet-only views. The full index retains custom profiles. Breadcrumbs
connect Home, Targets, body, Finder target, and God's Eye location. Native anchor
filters adapt Watermelon Continuous Tabs; breadcrumb semantics adapt Breadcrumb 1.

Home counters reveal their exact API digits on downward viewport re-entry; evidence bars grow to
their API-supplied width once on entry. The final text stays accessible throughout.
Reduced motion renders the final state immediately, including live preference
changes. No scientific values are interpolated or generated for animation.

Font/component provenance and license information: web/vendor/fonts/INTERFACE-FONTS.md.
Panchang binaries are acquired locally, not redistributed through this repository.


## Orb controls and scroll text

Primary and secondary narrative actions adapt Watermelon Button 12's pill form
with a decorative, circular orb containing the existing arrow icon. Finder zoom
controls adapt Watermelon's grouped-button and circular map-control patterns,
retaining native buttons and existing zoom/reset handlers. The main navigation
uses a sliding white selection pill on route, hover and keyboard focus. Destination
filters never underline on hover. AUC separates its label from the API value.

Narrative headings and supporting copy reveal with a bounded mask on downward viewport
entry; counters replay only after fully leaving and re-entering while scrolling down.
Reduced motion cancels active reveals and keeps final content visible. Dense
scientific interfaces keep readable Roboto; short narrative copy uses Panchang.


## Finder control system

Native button actions share the pill/orb treatment. Watermelon Dropdown Disclosure
informs all native-select adapters, menus and details disclosures, with keyboard
selection and Escape/outside dismissal. Top-layer popovers escape sidebar clipping;
unsupported browsers retain the native selects. Globe/Map and sidebar tabs share
sliding selection pills. Known analogs uses a native checkbox with switch semantics
and a sliding knob. Overlay keeps its native range input with an adaptive white-to-
red fill and an explicit percentage. Score gauges render API scores alongside the
same numerical labels; no scoring is performed in the frontend.

Dataset/source labels use locally hosted Anton at 16px. Home evidence bars have
fully rounded tracks and fills. Text and number reveals use a slower cadence and
are suppressed (and canceled) while scrolling upward; reduced motion stays static.


## Save Toggle and disclosure shells

Known analogs uses the Watermelon Save Toggle pattern: a stable-size pill briefly
morphs to a check state, with Shown/Hidden labels tied to the original native
checkbox. It changes visibility immediately and does not imply saved data.
Reduced motion renders the final state without the morph. Offline/AUC, Help and
layer selection use Dropdown Disclosure shells with circular icons, close controls
and highlighted rows. Header panels are clamped inside the viewport. Planet preview
captions and interaction hints use locally hosted Anton at readable sizes.

Shared hint copy, including the ranked-results summary, uses Anton; API measurement
spans retain their measurement typeface. Map previews occupy a separate overlay
above the floating toolbar so their close and action controls remain reachable.
