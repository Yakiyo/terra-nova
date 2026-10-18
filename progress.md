# TerraNova frontend redesign handoff

## Status

Requested redesign is complete. No implementation work remains from this session. No commit was created. README.md already had user changes; those were preserved.

## Approved direction and instructions

- User approved balancing judging/demo presentation with regular scientific use.
- Omega ClearSpace-inspired planetary storytelling, NASA-inspired red/blue/white, modern self-hosted type, graphical statistics, consistent routes, temporary logo, fast terrain reuse.
- No Sites skill. Used Impeccable, including independent finish review and documentation verification. Direction contract: `.impeccable/frontier-direction.md`.
- Preserve offline behavior, scientific results, units and provenance. Scientific computation stays in `src/compute`.

## Completed work

- Home: oversized interactive Earth, mission destinations, API-supplied criterion graphics and terrain story.
- Targets: planetary editorial sections and target-specific navigation.
- Shared system: blue surfaces, IBM Plex Sans/Mono, red actions, SVG mark/favicon, responsive typography and spacing, consistent controls and dataset links. DESIGN.md and `.impeccable/design.json` document it; PRODUCT.md records product constraints.
- Lenis is pinned and vendored with its MIT license. Narrative pages use smooth wheel/anchor scrolling and hero parallax; map controls remain native. Reduced motion disables smoothing and parallax.
- God’s Eye: deferred renderer allocation, bounded expiring request cache, current-mesh reuse, tile-revision-aware API response cache, stale terrain/imagery guards, imagery timeout/texture cleanup, grouped sun/climate controls and clear error recovery.
- Display slopes moved from JavaScript to `src/compute/terrain.py` and returned by the API with terrain provenance. Removed score count-up so text immediately displays the actual API score.
- Prepared leading targets’ terrain/imagery with `python -m src.acquire.sitetiles --top 1`. These local assets are gitignored.
- Fixed missing Home-data failure feedback/retry, mobile Help accessibility and consistent SVG known-analog markers. Search retains a keyboard focus outline.
- Made hover-preview regression independent of gitignored cache files. Added terrain slope, API cache invalidation and JavaScript request coalescing/eviction/retry tests.
- Added reproducible desktop/mobile visual review in `scripts/design_review.mjs`; smoke waits for actual readiness instead of fixed API delays. Corrected screenshot same-hash navigation and Windows UTF-8 file handling.

## Verification

- Full offline Python suite: **76 passed**.
- Node terrain-request test: passed.
- Ruff, module syntax and `git diff --check`: passed.
- Final browser smoke: every check passed, including Explore, Validation, custom/alias navigation, map layers, modal focus/Escape and exports’ surrounding interface.
- Desktop/mobile screenshots: no horizontal overflow, visible broken images or runtime exceptions. Actual God’s Eye terrain rendered on both sizes.
- Reduced motion and failed Home-data request/retry verified. Repeat terrain openings issued no additional terrain request.
- Independent reviewer scored all listed fixes resolved, disposition `ship` for that fix scope. No approved image comp was used; review was based on the user-pinned reference direction, actual screenshots and source.
- Screenshots/reports: ignored `artifacts/frontend/`, including `report.json`, `report-finder.json`, `desktop-home.png`, route/detail/terrain captures and `mobile-facts-error.png`.

## Preview and operational limits

- Verification server runs offline at **http://127.0.0.1:8001/**, exec session **12348**. Keep it alive for the preview. The existing server on port 8000 was not stopped; restart that separately to load backend changes if needed.
- Other terrain sites still require prefetch or a copied local cache. No fabricated terrain is supplied offline. Prepare caches on each demo machine; performance is not guaranteed for uncached network downloads.
- Polar coverage and terrain-scale caveats remain unchanged. Thermal/weather views remain illustrative.
- Review summary: `docs/FRONTEND_REVIEW.md`; AI work recorded in `docs/AI_USE.md`.

## Commands

```powershell
$env:OFFLINE='1'; $env:EAF_WARM='0'; ./.venv/Scripts/python.exe -m pytest tests -q
node --test tests/terrain_data.test.mjs
./.venv/Scripts/python.exe -m ruff check src tests scripts
node scripts/ui_smoke.mjs http://127.0.0.1:8001
node scripts/design_review.mjs http://127.0.0.1:8001
```

Pytest needed execution outside the sandbox because its temporary directory was blocked. Headless WebGL captures are expensive: run browser checks serially to avoid artificial timing failures. Use explicit UTF-8 when editing HTML on this Windows machine.
