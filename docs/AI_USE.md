# Use of AI in this project

### 2026-11-11 — Shared space backdrop, refresh and tab-return stability

Codex reused the finale's Milky Way backdrop behind every cinematic Home chapter
and kept wrapped stars as a subtle continuous overlay. Added synchronous desktop
loading selection to prevent the legacy Home flashing before modules initialize,
with a fallback when the cinematic import fails. Chapter focus reveals now require
intentional Tab input; visibility changes cancel stale Lenis easing at the current
scroll position. No scientific data or calculations changed.
Playwright checked delayed script loading, all chapter backgrounds, restored focus,
interrupted easing, actual tab switching and the existing touch-phone layout.
Chapter regression checks passed. Review script and captures are in
`artifacts/verify-home-stability.js`, `artifacts/home-refresh-loading.png` and
`artifacts/home-shared-space.png`.

### 2026-11-11 — Looping space stars and credit-line removal

Codex replaced the cinematic star plane's accumulating rotation with viewport-sized
wrapped drift in the existing points shader. Star offsets remain bounded and the
field adapts to window resizing; reduced motion freezes the drift. Removed the
visible planetary-texture credit line at the user's request, retaining the asset
provenance in `web/assets/cinematic/CREDITS.md`. No scientific data changed.
Chapter smoke checks passed. Playwright verified simulated long-running offsets,
credit removal and reduced motion without JavaScript errors. Visual capture:
`artifacts/starfield-long-run.png`.

### 2026-11-11 — Consistent Earth-to-finale transition

Codex fixed the final chapter background scrolling over the outgoing Earth scene.
The finale media now fills the viewport and becomes visible only when the shared
chapter controller swaps scenes beneath full black. Finale text uses the shared
entrance curve while retaining its final readable state. WebGL fallback keeps a
section-local background. No scientific calculations or data changed.
The focused chapter smoke checks passed, including the outgoing scene, full-black
swap, full-viewport entrance, reverse scrolling and reduced motion. Desktop visual
captures are `artifacts/finale-transition-earth-fixed.png` and
`artifacts/finale-transition-arrival-fixed.png`.

### 2026-11-11 — Home design selection with docked DevTools

Codex traced the old Home appearing in the supplied screenshot to width-only
desktop selection. Updated the landing entry, cinematic guard and stylesheet to
retain cinematic Home for mouse/trackpad desktops at narrow widths. Added compact
desktop styles and browser regressions for resizing and cold loading, and kept
the existing touch-phone experience. No scientific calculations or data changed.
Playwright verified the narrow desktop composition and the touch-phone fallback;
captures are in `artifacts/home-docked-fixed.png` and
`artifacts/home-mobile-preserved.png`.
The focused Home layout smoke checks passed. The broader suite still expects
the retired Targets page and its old Home links; those existing expectations
prevent a clean full-suite result. Home chapter transitions, reduced motion and
mobile counters passed the separate motion run.

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

### 2026-10-31 — Terrain loading and interface copy review

Codex reviewed acquisition, API, compute tests and frontend behavior, and reproduced
an offline God's Eye failure on a ranked Jezero result using Playwright. Site tile
preparation used different discovery filters from Finder. Aligned preparation with
the API's UI defaults, made explicit acquisition work from an offline shell, restored
the environment afterward, added bounded parallel preparation and failure exit
codes, and populated the local elevation cache for the default rankings. These
gitignored tiles must travel with the app for an offline demo; other locations may
still require preparation. Satellite imagery falls back to measured shaded relief.

Fixed same-target terrain links retaining the previous location and retries skipping
an interrupted terrain build. Removed repeated Home and target-list copy and moved
matching and terrain-scale explanations into disclosures, retaining source links,
measurements and caveats. Scientific calculations were unchanged.

Validation: offline Python and JavaScript tests, Ruff, frontend module syntax,
full browser smoke suite, Playwright retry/cache/link regressions and desktop/mobile screenshots. The design
detector flagged existing font, radius and decorative-container conventions covered
by DESIGN.md; the review preserved the established identity.

### 2026-10-31 — Satellite imagery follow-up

The user's Gobi Desert screenshot showed measured relief without satellite
imagery. The earlier preparation downloaded elevation only. Prepared satellite
tiles for Finder's default rankings, and changed the development instructions to
recommend full imagery preparation. Fixed Satellite selection reusing an empty
texture after failure, made incomplete imagery retry on reopening, and prevented
automatic Relief fallback from carrying into a different site. Explicit user
surface selections remain authoritative. Added a Playwright regression covering
blocked-image recovery, switching sites and satellite rendering across rankings.
Imagery source: EOxCloudless Sentinel-2 2020, https://cloudless.eox.at/ (dataset
`s2cloudless-2020_3857`). No scientific calculations changed.

Playwright confirmed satellite rendering at sampled ranks for Moon and Mars,
including the exact Gobi Desert link, and passed forced-failure retry and
cross-site fallback checks. JavaScript resource tests, syntax checks and Ruff
passed. The concurrent full smoke run flagged an unrelated mobile preview
position check; terrain checks passed.
The isolated interaction smoke rerun passed, including that mobile preview check.

### 2026-10-31 — Conservative code and asset cleanup

Codex traced module references, declarations, stylesheet selectors and asset
references, and checked image/vendor files for identical contents. Removed the
legacy tab underline DOM, resize handler and update function; the shared segmented
control already owns the visible slider. Removed obsolete hint/card selectors,
hidden target planet markup, its unused background animation, and disabled Home
scrim rules. Removed the unused Panchang 700 face and local binary and narrowed
font acquisition to the active weight. Preserved imagery, licenses, offline caches,
API endpoints and targeted regression scripts.

Replaced the duplicate Terrarium decoder and repository-root calculation in the
predictor acquisition script with the existing shared implementations. Kept the
NaN-aware acquisition block mean separate from the ordinary terrain block mean;
their behaviors differ. No scientific formulas or displayed behavior changed.

Validation: offline Python suite, JavaScript cache/codec tests, Ruff, module syntax,
literal local asset audit and cached font acquisition passed. Browser smoke
verification disconnected before completion. Fresh Playwright checks passed for
terrain retry/reopening/shared links, desktop/mobile Targets and terrain, Home's
active font and appearance, and the single shared tab slider.

### 2026-11-05 — Cinematic Earth, sunlight and chapter choreography

Codex inspected the live Omega ClearSpace page using Playwright CLI and compared
the supplied screenshot with the running local Home page. Refined the existing
Three.js renderer with cloud shadows, ocean shading, atmospheric light and an
animated solar corona, using the existing locally hosted textures. Added full-black
chapter changes, a centered TerraNova brand quote over the orbital Earth view, and
large cropped Moon/right and Mars/left entrances. Preserved API target selection,
source links, analog locations, mobile Home and the Finder launch.

No scientific calculations or datasets changed. The quote reuses TerraNova's own
headline and is identified as brand copy. The visual reference has source_url
https://www.omegawatches.com/world-of-omega/sustainability/clearspace and dataset_id
omega_clearspace_ui_reference. Imagery has source_url
https://www.solarsystemscope.com/textures/ and dataset_id
solar_system_scope_planetary_textures; see the existing asset credits for licensing.

Playwright verified desktop/laptop/mobile rendering, a fully opaque blackout,
forward and backward chapter navigation, target selection, keyboard focus between
chapters, reduced motion, WebGL context-loss fallback and the Finder launch without
JavaScript exceptions. JavaScript syntax checks passed. The Impeccable detector
reported design-token advisories; the intentional black transition is documented
in DESIGN.md. Legacy counter checks in the UI smoke script now run at the smaller
viewport where that layout is still active; desktop checks cover the cinematic flow.
The broad browser run passed its existing checks but exposed fixed-delay timing in
the new software-rendered scene checks. Replacing those delays with rendered-state
waits made the motion smoke rerun pass (`artifacts/cinematic-motion-smoke.txt`).
`nCinematic simplification: removed catalog page content and Home descriptions/source rows at user request, retained Finder access, introduced Panchang display with blue/white/red roles, and animated stars and hero planets. No scientific calculations changed.
`nCursor/motion refinement: Earth uses eased pointer rotation; Moon/Mars rotate independently at a more visible pace. Removed visible location rings, enlarged destination rows, removed Home link underlines and changed display type to light Roboto. Hero arrow retains an accessible label and animated Lenis scrolling. Reduced-motion preferences remain respected.
`nHome space refinement: integrated user-supplied Lucide chevron SVG, brighter screen-sized stars, longer chapters and bounded wheel deltas. Enlarged destination/analog lists and removed divider lines and red arrows. Site names now link directly to Finder. Compared large-wheel input on Omega using Playwright; timing is tuned to the reference rather than copied from its implementation.
`nSpace color polish: replaced the navy Home background with neutral near-black and neutralized the star tint while preserving visibility, motion and planetary atmospheric lighting.
`nRestored the original Anton display typography at user request; existing Roboto body text and Panchang supporting styles remain. Preserved the current layout, colors and motion.
