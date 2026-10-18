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
