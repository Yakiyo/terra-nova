# Use of AI in this project

Keep this current as you build. Every member adds their own entries.

## Tools
- AI Assistant: research notes (`EVERYTHING you need.md`), the repo review
  (`docs/REVIEW.md`), the workspace setup, and the first draft of the video script.
- _(add each tool used: name, version, what for)_

## What the AI did
- 2026-09-28: Compared the research notes against the mentors' build guide and this
  repo; ran the model against known analog sites (`scripts/check_controls.py`);
  drafted `docs/TEAM_PLAN.md` and `docs/VIDEO_SCRIPT.md`.

- 2026-09-28 (v2): AI rebuilt the data pipeline (NASA POWER, GIBS NDVI,
  Natural Earth land mask), changed scoring to a weighted geometric mean with
  Earth-envelope clamping, added validation (`src/compute/validation.py`) and the
  known-analog catalog, and wrote the three.js interface. Every number in the app
  comes from `src/compute`; the team should review `data/targets.json` choices
  (terrain percentile classes) and `data/known_analogs.json`.

- 2026-10-03: AI redesigned the web interface to the "Mission control" system in `DESIGN.md`
  (the team chose the direction, the NASA-red accent and the motion level), applying the rules
  of the impeccable, taste-skill and ui-ux-pro-max design skills. It also fixed the Finder crash
  on links without a target, added link aliases, made God's Eye behave as a dialog, carried over
  the slow-network fix, and restored the offline thumbnail cache.

- 2026-10-18: AI reviewed frontend/API/cache integration and implemented the approved NASA-inspired
  Frontier redesign, using Omega ClearSpace as a composition reference and locally vendored Lenis.
  Added a temporary SVG mark, source-linked criterion graphics, responsive route styling, deferred
  terrain initialization, bounded caches and stale-request protection. Moved display slopes into
  src/compute. Added regressions and browser captures; prepared leading-site terrain caches through
  the existing acquisition script. See PRODUCT.md, DESIGN.md and docs/FRONTEND_REVIEW.md.

## What the AI did not do
- Scores come from the deterministic code in `src/compute`, never from a model.
- _(team: record the dataset choices, method decisions and design that are yours)_

## Prompts
- _(paste or summarise the key prompts here, with dates)_


## 2026-10-18 navigation and visual refinement

Implemented the user-approved black-space theme, Lenis-reference typography,
planet-only target routes, source-preserving digit and evidence-bar reveals,
Watermelon-inspired native breadcrumbs and destination filters. Used Impeccable
and UI UX Pro Max guidance. Scientific computations and data ramps were preserved.
Fonts are locally acquired through src/acquire/ui_fonts.py; licenses and source
links are recorded in web/vendor/fonts/INTERFACE-FONTS.md.


## 2026-10-18 crimson and interaction refinements

Applied user-requested crimson actions, red evidence bars and a consistent red
analog-score ramp without changing rank thresholds or score calculations. Adapted
Watermelon button/map-control patterns as native pill/orb actions and circular zoom
controls. Added main-nav sliding selection, replaying API-digit reveals, masked
scroll text, Panchang narrative supporting copy, and separate AUC label/value roles.
Used Impeccable typography/motion guidance and a read-only typography assessment.


## 2026-10-18 Finder disclosure and input refinement

Added native adapters for Watermelon Dropdown Disclosure, Adaptive Slider and
Switch Mode. Preserved existing native input values/events and API calculations.
Added sliding Globe/Map and sidebar selections, API-linked score gauges, shared
Finder orb buttons, Anton source-label text, rounded Home evidence bars and slower
downward-only reveals. Extended browser checks for input semantics, dynamic menus,
keyboard dismissal, motion direction and score/source presentation.


## 2026-10-18 Save Toggle and named disclosures

Read Watermelon Save Toggle and Dropdown Disclosure component sources, then
adapted their structure to the existing native frontend. Known analog visibility
keeps its native checkbox/application handler behind an accessible pressed button.
Offline/AUC, Help and map-layer disclosure shells gained circular icons, close
headers and richer selection rows. Planet preview captions use local Anton.

### 2026-10-18 — Finder preview dismissal and summary typography

Codex separated site previews from the marker stacking layer so the floating
toolbar cannot intercept their close button. Shared hint text and the results
summary now use the existing locally hosted Lenis-reference Anton font. No API
values or scientific calculations changed. Browser checks exercise actual mouse
clicks with previews deliberately overlapping the toolbar in Globe and Map views
at desktop and mobile widths.


### 2026-10-18 — Frontend consistency

Codex inspected Omega ClearSpace navigation and Lenis demo font assignments, and
adapted Watermelon Dropdown Disclosure source to the existing vanilla frontend.
Added shared navigation, range presentation and disclosure motion; changed supporting
copy to Roboto and neutralized decorative validation greens. Native controls,
scientific APIs, source attribution and data color ramps are preserved. Extended
browser checks for navigation focus, slider reset synchronization and animation
interruptions; desktop/mobile verification results are recorded in docs/FRONTEND_REVIEW.md.

### 2026-10-19 — Design consistency, count-up and analog roles

Codex refined the existing shared controls, consolidated select styles, shortened
interface copy and added text-link and arrow motion. Home summary counters now
count up decoratively to exact API values with accessible final text and reduced-
motion handling. Shared analog role labels and icons use existing validation roles
and catalog kinds; ranked candidates are not reclassified. Scientific calculations,
API contracts and datasets are unchanged. Browser smoke coverage includes disabled
selects, fallback behavior, role accuracy, counter progression and cancellation.
Verification: the complete UI smoke suite and module syntax checks passed. Desktop
and mobile design captures passed layout, image, navigation and terrain checks.
The design detector report retains existing font/token advisories, including stale
sidecar mismatches; the approved visual system was preserved.

### 2026-10-19 — Link and page-transition corrections

Codex removed underlines from planet navigation links and replaced layered link
underlines with a single native underline. Added first-paint header/action markup,
earlier shared-control initialization, font preloads, matching target placeholders
and progressive document crossfades with reduced-motion support. Removed the opaque
Home title scrim so the decorative Moon and Mars remain visible. Scientific data
and calculations are unchanged.
Verified the initial shell with page JavaScript disabled, navigation and single
underlines across target routes, and motion/reduced-motion behavior. Desktop/mobile
captures passed layout and image checks. Scroll and arrow assertions now wait for
browser frames/animation completion instead of assuming fixed timing.

### 2026-10-19 — Stable menu scroll locking

Codex reserved the document scrollbar gutter and matched navigation dialog widths
to their headers to prevent layout shifts when opening or closing the menu. Added
desktop/mobile checks for content width, position, logo alignment and scroll
position across Home, Targets and Finder. Scientific behavior is unchanged.
Verification passed: opening and closing navigation preserved layout and scroll
position across those pages on desktop/mobile; measured opening shifts were zero.

### 2026-10-19 — Page-arrival blink

Codex inspected frames from the supplied screen recording, which showed the Targets
heading appearing and then being masked by a delayed text reveal. Visible arrival
text now skips that initial mask while retaining downward scroll replays. Removed
full-document fades that could expose an empty snapshot during navigation. Added navigation
regressions with delayed control-script delivery at desktop and mobile sizes.
Verification passed for real Home/Targets navigation with delayed scripts, existing
scroll/counter motion, and desktop/mobile Targets captures. The final navigation
regression completed without browser exceptions.

### 2026-10-19 — Resource and duplication audit

Codex measured and fixed retained dynamic-control listeners and repeated full-page
DOM scans; added observer/animation cleanup, bounded thumbnail URL ownership and
coalescing, safer terrain request eviction and close callbacks, and shared codecs.
Removed confirmed unused legacy font/image assets and obsolete counter CSS. Added
serialized API initialization and bounded LRU robustness caching without changing
scientific computation. Offline Python, browser, resource and asset checks passed;
commands and measured results are recorded in docs/OPTIMIZATION.md.

### 2026-10-20 — Pre-commit repository cleanup

Codex reviewed source references, acquisition entry points, frontend modules,
dependencies, offline assets and the existing working-tree changes. Removed the
superseded prototype architecture guide (`explanation.md`), stale session handoff
(`progress.md`), unused view/basemap helpers, unused serialization and batch-label
methods, and duplicate ignore entries. Updated remaining documentation references.
Kept offline predictor arrays, vector data, thumbnails, acquisition tools, tests,
licenses and design guidance. Scientific formulas and API contracts are unchanged.
The offline Python suite, JavaScript resource tests, Ruff checks, frontend module
syntax checks, local asset audit, offline validation controls and full browser
smoke suite passed after cleanup. Existing dependency deprecation warnings remain.
