# Frontend redesign and code review

## Scope

Reviewed repository instructions, application architecture, static routes, shared controls/styling, API contracts, acquisition/cache paths, terrain computation boundaries and regression tests. Preserved scientific scoring, normalization, validation, discovery filters and exports. This is a frontend/integration review, not a security audit or new scientific validation study.

## Findings addressed

- God’s Eye allocated a renderer during Finder startup; initialization is deferred until first use.
- Reopening repeated API work and mesh creation. Bounded successful terrain caches and current-mesh reuse avoid this. Source-tile revisions invalidate the API cache.
- Older imagery callbacks could reach a newer site’s canvas. Jobs now capture their destination and terrain generations reject stale responses/errors.
- Imagery had no completion deadline; failed/slow tiles now settle while terrain remains usable.
- Browser-computed display slopes now come from `src/compute/terrain.py`. Native-resolution statistics remain unchanged.
- Score text now displays the API result immediately; animated intermediate numbers have been removed. Graphical bar motion remains.
- A hover-preview test depended on gitignored cache files. Synthetic source tiles now test composition and cache reuse offline.
- Routes now share blue surfaces, modern self-hosted type, red actions and a temporary mark. Home/Targets use a planetary editorial narrative. Criterion graphics link to datasets.
- God’s Eye groups sun and climate settings into native disclosures.

## References

- [Omega ClearSpace](https://www.omegawatches.com/world-of-omega/sustainability/clearspace): planetary imagery and scrolling story.
- [Lenis](https://github.com/darkroomengineering/lenis): pinned locally with its MIT license; narrative pages only.
- Existing NASA/partner imagery retains attribution; scientific ramps in `web/colors.js` remain unchanged.

## Verification

```powershell
$env:OFFLINE='1'; $env:EAF_WARM='0'; ./.venv/Scripts/python.exe -m pytest tests -q
node --test tests/terrain_data.test.mjs
./.venv/Scripts/python.exe -m ruff check src tests scripts
node scripts/ui_smoke.mjs http://127.0.0.1:8001
node scripts/design_review.mjs http://127.0.0.1:8001
```

Python and terrain-request regressions pass. Reproducible browser captures are stored in gitignored `artifacts/frontend`. The review script checks desktop/mobile overflow, broken images, runtime exceptions and reduced motion. The mechanical detector also ran; its rounded-control and overlay advisories concern inherited components. Clipping of decorative planetary imagery is intentional.

The independent finish review identified missing Home-data failure feedback, an unnamed mobile Help button and inconsistent emoji markers. These were corrected with a visible retry state, a persistent accessible label and a shared SVG rocket. The design contract is `.impeccable/frontier-direction.md`. The documentation received an independent consistency pass. The reviewer confirmed all listed fixes resolved; the final smoke run passed every check.

The targeted visual run also exercises a failed Home data request followed by a successful retry, and verifies that reopening the same terrain sends no additional terrain request. `report-finder.json` contains those observations. Cached terrain rendered successfully on desktop and mobile.

## Operational limits

Terrain detail requires real source tiles. Leading sites were prepared with `python -m src.acquire.sitetiles --top 1`; other results need prefetch, a copied cache, or acquisition with network access. Do not claim universal instant loading. These caches are gitignored and must be prepared separately on another machine.

Polar coverage exclusions remain explicit. Thermal/weather views remain illustrative simulations. Terrain-scale caveats in `docs/REVIEW.md` still apply. Fetch failure does not produce fabricated replacement data.

The user-approved reference direction governed the redesign. The final mark remains temporary. Existing README edits were preserved.

## Space-black refinement verification — 2026-10-18

The approved refinement is implemented across Home, Targets, Finder and God's Eye.
Planet-only query links and legacy planet hashes filter the destination catalog;
the full index retains custom profiles. Watermelon-inspired breadcrumbs and the
native All/Moon/Mars switcher support direct loading and browser history.

Home counter digits and evidence bars reveal once, with final API text remaining
accessible. The inherited CSS evidence-bar animation was disabled so it does not
overlap the new reveal or persist as a finished animation under reduced motion.
Anton, Roboto and locally acquired Panchang match the inspected Lenis reference.
See web/vendor/fonts/INTERFACE-FONTS.md for sources, licenses and acquisition.

Validation completed against the isolated offline server on port 8018:

- Extended UI smoke suite passed, including planet filters, legacy hashes,
  refresh/history, Finder/terrain breadcrumbs, API counter equality, reveal
  completion, source readability, local font loading and reduced motion.
- Desktop/mobile visual review passed overflow, missing-image and runtime-error
  checks, plus unavailable-data retry and terrain-cache reuse checks. Captures
  and the current report are in gitignored artifacts/frontend.
- Module syntax checks, acquisition-script Ruff checks, cached font acquisition
  under OFFLINE=1 and git diff whitespace checks passed.
- Impeccable's detector ran. It reported inherited layout/style advisories and
  token-ramp advisories; Roboto's overuse warning conflicts with the explicitly
  approved reference font. Decorative globe clipping remains intentional. This
  was not a clean detector run, and unrelated legacy UI was not redesigned.

The batched visual review and confirmation pass found no remaining blocking defect
in the requested refinement. Scientific algorithms and API contracts were unchanged.


## Crimson controls and repeated reveals — 2026-10-18

User-requested changes replace orange-red action tokens with clear crimson, color
Home evidence bars red, and align the score ramp and Finder bars/markers with red.
Rank thresholds and score values are unchanged. Other data-layer palettes remain
unchanged. Watermelon Button 12, grouped-button controls, circular map controls and
orb visual references inform native buttons, keeping existing handlers and labels.

Panchang now carries short narrative subtext; Anton carries Finder detail headings.
The AUC badge separates its label and API value with readable Roboto type. Main
navigation slides on route selection, pointer hover and keyboard focus; destination
filters have no hover underline. Counters replay after fully leaving/re-entering
view. Narrative headings and copy reveal with bounded masks; reduced motion shows
final content and cancels active reveals.

The expanded browser smoke suite passed, including replay, text reveals, font
roles, orb buttons, red evidence bars and accessible zoom controls. Visual review
caught and corrected mobile toolbar/zoom overlap and an overlong hero text line.
The type detector reported the newly used support face missing from the design
frontmatter; the support role is now documented. Existing token-ramp and reference-
font advisories remain. The read-only typography assessment confirmed the role
split: expressive narrative type and readable dense scientific copy.

The confirmation review passed on desktop and mobile: the map toolbar stays clear of zoom controls, navigation follows keyboard focus and restores route selection, and no runtime exceptions or broken images were reported. Cached terrain and reduced-motion/fetch-retry checks also passed.


## Finder input adapters and downward motion — 2026-10-18

Implemented Watermelon Dropdown Disclosure, Adaptive Slider and Switch Mode as
native adapters. Existing select/checkbox/range state and application handlers
remain the source of truth. Menus use top-layer popovers to avoid sidebar clipping,
with arrow-key selection, typeahead, Escape focus restoration and outside dismissal.
Dropdown key handling prevents Finder shortcuts from firing during menu selection.
Dynamic selectors in Explore and Custom profiles receive the same treatment.

Globe/Map and sidebar tabs now have sliding selection pills. Finder actions share
orb buttons; source/dataset links use locally hosted Anton. Rounded Home bars and
API-linked score gauges preserve numerical labels, units and provenance. The overlay
is visible on mobile and adapts from white to red with its native input value.

Focused control checks passed for selection/state synchronization, keyboard and
Escape behavior, switch state/markers, adaptive overlay values, sliding view state
and score-gauge provenance. Desktop/mobile confirmation passed overflow, missing
images, navigation focus, toolbar clearance, cached terrain and reduced-motion/
fetch-retry checks. The detector still reports approved-reference font and bounded
control-transition advisories; no clean detector result is claimed.

The direction guard checks the current scroll position inside the intersection
callback as well as scroll events, and ignores small smooth-scroll settling
corrections. This addresses differing delivery order during rapid viewport jumps.


The isolated motion check passed: API values remain exact, slower reveals finish,
downward re-entry replays, upward scrolling stays static, Home bars remain rounded,
source labels use Anton, and reduced motion cancels decorative animation. The
browser test now waits for the intermediate viewport position to render before
reversing direction, so coalesced programmatic jumps are not mistaken for separate
user scroll gestures. Focused control checks and desktop/mobile visual confirmation
also passed. Final complete smoke results are recorded below.


The complete regression exposed timing-sensitive checks around the moving map card
and the slower reveal duration. The card close target is now larger; its real-click
check waits for camera placement to settle. Reveal-completion checks wait for the
actual animation to finish instead of assuming the former duration. Focused
interaction and motion modes passed after these changes; they are available as
`--interaction-only` and `--motion-only` arguments to scripts/ui_smoke.mjs.

Final complete UI smoke run passed every check, including existing Finder/terrain/custom-profile/navigation workflows and all new disclosure, switch, adaptive-overlay, gauge, slider, source-font, rounded-bar, reduced-motion and scroll-direction checks. JavaScript syntax and whitespace checks also passed.

## Finder Save Toggle and disclosure refinement — 2026-10-18

Adapted Watermelon Save Toggle for Known analogs and Dropdown Disclosure for
Offline/AUC, Help and the layer/Analog score selector. The toggle reports Shown or
Hidden and preserves the existing marker checkbox state. Disclosure shells include
circular leading icons, explicit close controls and selected-option indicators.
The target coordinates and rotation hint now use locally hosted Anton.

Focused control smoke checks passed, including marker visibility, native select
synchronization, keyboard selection, Escape/close focus restoration and font
assignment. Desktop and mobile captures confirmed open panels stay within the
viewport. Finder terrain, cached reopening, reduced motion and failure/retry checks
also passed without runtime errors. JavaScript syntax and whitespace checks passed.
The Impeccable detector continues to report advisory findings; this is not a clean
detector result.

## Preview close collision and shared hints — 2026-10-18

Site previews now have a separate overlay above the map toolbar. Real mouse-click
regressions passed with the close button deliberately over the toolbar in Globe
and Map views at desktop and mobile widths. Shared hint text and the results
summary use locally hosted Anton. Focused interaction smoke, desktop/mobile layout,
terrain/cache reopening, reduced-motion and failure/retry checks passed. Module
syntax and whitespace checks passed.
