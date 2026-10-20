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

Responsive breakpoints: 1280px, 1020px and 720px, with additional narrow navigation adaptations. Navigation is 76px on desktop and 68px on mobile. Its centered identity and compact utilities remain on one row on narrow screens.

## Elevation & Depth

Depth comes from the planetary scene and measured terrain. Page surfaces remain flat. Floating map/terrain panels and search controls use overlay surfaces and backdrop blur. Menus/dialogs retain the existing shadow token. No decorative glows or gradient text.

Motion uses `--ease` with fast, state and view durations. Home/Targets use locally vendored Lenis for wheel smoothing and anchors; Home also has subtle hero parallax. Finder/God's Eye retain native map input. Reduced motion disables smoothing, parallax and decorative transitions; Home globe automatic rotation is disabled when reduced motion is set at page load.

## Shapes

Actions and selections have compact corners; tool panels/dialogs use shared radius tokens. Planetary target groups and ranked results use divided rows; custom target entries retain the card treatment. Preserve native input affordances and visible keyboard focus.

## Components

- **Navigation:** left menu trigger, centered temporary SVG mark and wordmark, contextual utilities. The shared menu exposes Home/Targets/Finder and Moon/Mars destinations with a red active-route indicator.
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

Home summary counters count from zero to their API values over 1.2 seconds on downward
viewport re-entry; evidence bars grow to their API-supplied width once on entry. The exact final text stays accessible throughout.
Reduced motion renders the final state immediately, including live preference
changes. Intermediate counter digits are decorative and aria-hidden; scientific measurements and evidence values remain steady.

Font/component provenance and license information: web/vendor/fonts/INTERFACE-FONTS.md.
Panchang binaries are acquired locally, not redistributed through this repository.


## Orb controls and scroll text

Primary and secondary narrative actions adapt Watermelon Button 12's pill form
with a decorative, circular orb containing the existing arrow icon. Finder zoom
controls adapt Watermelon's grouped-button and circular map-control patterns,
retaining native buttons and existing zoom/reset handlers. The main navigation uses the shared expanding menu described below. Destination
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

Dataset/source labels use locally hosted Roboto at 14px. Home evidence bars have
fully rounded tracks and fills. Text and number reveals use a slower cadence and
are suppressed (and canceled) while scrolling upward; reduced motion stays static.


## Save Toggle and disclosure shells

Known analogs uses the Watermelon Save Toggle pattern: a stable-size pill briefly
morphs to a check state, with Shown/Hidden labels tied to the original native
checkbox. It changes visibility immediately and does not imply saved data.
Reduced motion renders the final state without the morph. Offline/AUC, Help and
layer selection use Dropdown Disclosure shells with circular icons, close controls
and highlighted rows. Header panels are clamped inside the viewport. Planet preview
captions and interaction hints use locally hosted Roboto at readable sizes.

Shared hint copy, including the ranked-results summary, uses Roboto; API measurement
spans retain their measurement typeface. Map previews occupy a separate overlay
above the floating toolbar so their close and action controls remain reachable.


## Shared navigation and controls (October 2026)

Omega ClearSpace is the behavioral reference for the left menu trigger, centered
identity, expanding desktop navigation band and full-height mobile menu. Narrative
headers hide on downward scrolling and return on upward scrolling or keyboard
focus; Finder stays visible. God's Eye has the same header and a Back to Finder
action above its existing terrain controls. Navigation uses a native modal dialog,
locks background scrolling (including Lenis), and restores focus on dismissal.

Lenis demo typography was checked directly: Roboto for body and navigation, Anton
for display, Panchang for selected narrative accents. Supporting text, hints,
legends, preview captions, source links and validation explanations use Roboto.
Measurements retain IBM Plex Mono. Validation role labels use neutral theme ink;
passed checks include a check icon and explicit wording, not green-only meaning.
Scientific data ramps are unchanged.

All native range inputs share the Overlay track, white-to-red fill, knob and focus
ring. Native min/max/step/disabled state and application event handlers remain the
source of truth. Presentation follows input events and programmatic value changes;
existing formatted units/readouts remain, and only Overlay adds a percentage.

Dropdown Disclosure motion adapts Watermelon's measured container spring into
native Web Animations. Header panels and selection menus use the same shell
transition, content reveal and reversible close, with top-layer positioning.
Inline details share its timing while preserving disclosure semantics. Reduced
motion changes settle active transitions immediately. Controls are enhanced once,
including controls rendered after API responses.

Implementation: shared-controls.css, site-navigation.js, disclosure-motion.js and
range-control.js. Existing tokens, native input state and Phosphor icons are reused.
Reference sources: https://www.omegawatches.com/world-of-omega/sustainability/clearspace,
https://lenis.dev/, https://ui.watermelon.sh/animated-components/dropdown-disclosure.
These are UI references, not scientific datasets.

## Consistency and clarity (October 2026)

All selects use the shared Dropdown Disclosure adapter, including custom profiles,
country limits, map layers and Explore axes. Native selects remain the fallback
when popovers are unavailable. Shared control styling owns borders, focus states,
disabled states, menu shells, sliders and disclosures; use existing tokens and icons.

Home summary counters use a presentation-only 1.2-second count-up, replayed only
after fully leaving the viewport and returning while scrolling down. Exact API text
remains accessible throughout. Cancellation, hidden pages and reduced motion settle
to the final value immediately; evidence measurements never count up.

Text links animate one native underline’s offset and color on hover and keyboard focus, with no background-drawn duplicate. Planet navigation links have no underline. Linked actions move
their existing arrow subtly. Tabs, destination filters and brand links keep their
own interaction treatment. Reduced motion disables decorative transitions.

Validation roles use shared text, icons and explanations: rocket for Known analog,
mountains and a dashed outline for Geology only, crosshair for Non-analog reference.
Only environmental analogs are positive validation controls; geology-only sites are
excluded. Reference controls do not establish universal geological non-analogy.
Catalog markers and Explore reuse catalog kind; ranked results retain proximity
badges without inferred roles. Keep these meanings separate from dataset agreement
and pass/fail indicators. Validation method details use the shared disclosure.

Headers ship the final grid and menu trigger in HTML before enhancement. Home hero
actions include their orb markup at first paint; shared controls initialize ahead
of the scene modules. Preload narrative fonts and keep target loading placeholders
in the final planet/row layout. Document navigation has no full-page fade; interaction
and scroll motion respect reduced motion. The Home scene has no opaque title scrim,
so the Moon and Mars remain visible behind the headline area.

Document scrolling reserves a stable scrollbar gutter. Navigation dialogs match
their header width when opened and resized, keeping content and brand alignment
fixed while background scrolling is locked and restored.

Arrival text that is already in the viewport never starts a late reveal: it stays
visible while scripts initialize. Scroll reveals still run for below-fold content
and downward re-entry. Full-document view transitions are disabled so cold loads
and rapid page switches cannot fade through an empty page snapshot.

Dynamic component enhancements are scoped to added subtrees. Removed controls
release their observers, media-query listeners and animations through
dom-lifecycle.js. Shared presentation codecs live in format.js; preview resource
ownership uses bounded-cache.js. Keep reusable renderer resources and offline
assets rather than treating intentionally cached resources as unused.
