# Resource and duplication audit

Completed 2026-10-19. The existing design, API contracts, scientific calculations,
source metadata and offline datasets are preserved.

## Changes

- Dynamic controls release media-query handlers, mutation/resize observers,
  animations and popovers when removed. A shared lifecycle observer owns cleanup.
- DOM enhancement visits added subtrees rather than rescanning the document on
  every text update. Existing native events and programmatic slider updates remain.
- Thumbnail requests coalesce, time out and use a bounded LRU cache. Evicted blob
  URLs are revoked; active page-history entries retain their cache when appropriate.
- Terrain request failures cannot evict a newer request for the same location.
- Terrain close timers/listeners are cleared, and stale close callbacks cannot hide
  a reopened view. Removed an immediately overwritten terrain array allocation.
- Shared HTML escaping and binary-field decoding replace duplicate implementations.
- API initialization is serialized and publishes ready state only after all fields
  load. Robustness reports use bounded LRU eviction rather than clearing the entire
  cache; scientific computation remains outside the cache lock.
- Removed the unused Barlow/IBM Plex Sans font files, Barlow license, old digit-reveal
  CSS and unused Earth thumbnail. Updated thumbnail generation to avoid recreating
  that unused image. Active-font licenses and required image resolutions remain.

## Measured evidence

The original disclosure create/remove stress check increased retained media-query
listeners from 5 to 35 and document-wide selector calls from 14 to 119. After
cleanup, the same disclosure check held listeners at 5 and selector calls at 7.
An expanded check with dropdowns, ranges, segmented controls and open popovers also
held those counts at 5 and 7 after removal and garbage collection.

These measurements check component retention and repeated DOM work. Renderer
resources that intentionally remain attached to reusable views are preserved;
this report does not claim a measured change to GPU memory or page-load timings.

## Verification

- Offline Python suite: 79 passed. Existing dependency deprecation warnings remain.
- JavaScript resource/cache tests: 4 passed, including stale-request eviction.
- Complete browser smoke suite passed, covering native fallback, navigation,
  ranking, controls, terrain, responsive interactions and motion.
- Desktop/mobile captures passed layout, image, navigation and terrain checks.
- Literal local asset/module references resolve (`scripts/audit_web_assets.py`).
- Changed Python files pass Ruff checks; frontend modules pass syntax checks.

The browser retention check can be repeated with:

```powershell
node scripts/ui_smoke.mjs http://127.0.0.1:8000 --resource-audit
```
