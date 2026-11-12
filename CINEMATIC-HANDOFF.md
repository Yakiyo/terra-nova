# Terra Nova cinematic landing handoff

## Latest refinement

Inspected Omega ClearSpace live through Playwright CLI and applied the user's
follow-up: cloud/ocean Earth shading, animated warm solar corona, full-black scene
changes, centered TerraNova quote over an orbital Earth view, Moon entering from
the right and Mars from the left with oversized cropped limbs. Renderer ownership
is in `web/planet-journey.js`; `web/landing-entry.js` selects cinematic Home for wide
viewports or mouse/trackpad input, preserving it with docked DevTools. Narrow touch
devices use mobile Home; only a change of experience reloads the page.
This supersedes the older transition and
subtle-cloud notes below.

Playwright confirmed desktop, laptop, mobile, reverse scroll, keyboard traversal,
target selection, reduced motion, context-loss fallback and Finder launch. Captures
are in `artifacts/cinematic-final-*.png`. The Milky Way video remains the prior
placeholder pending the user's asset; it was outside this refinement request.
The motion smoke suite passed with chapter-state waits; its output is saved at
`artifacts/cinematic-motion-smoke.txt`.

## Goal
Implement the desktop cinematic landing sequence in `plan.md`: Earth hero, orbital Earth, Moon targets, Mars targets, documented Earth analog sites, Milky Way finale, and rocket transition to Finder. Keep existing mobile layout. The user will provide the Milky Way video later.

## Completed
- Added `web/cinematic.js` and `web/cinematic.css`; registered both in `web/index.html`.
- Desktop-only six-chapter scroll scene using local Three.js assets. Earth, Moon, and Mars share one new persistent WebGL renderer; Lenis remains locally hosted in `web/experience.js`.
- Current API catalog supplies three Moon and two Mars targets. Square thumbnails, selectable cards, details, and target links are present.
- Five sourced historical Earth testing locations are available as interactive choices. Selecting a site moves the globe orientation and highlights a point. Source links and dataset IDs are stored in the content records.
- Final call to action runs a procedural rocket animation then navigates to Finder. If WebGL fails, the link navigates normally.
- Existing mobile landing page remains active below 1021px.

## Verification
- `node --check web/cinematic.js` passed.
- Terra Nova Python suite: 81 passed, 3 warnings.
- Playwright: 1440×900 hero and Moon chapter rendered; all six chapters mounted; Moon/Mars lists loaded with 3/2 targets; no browser console errors; rocket action navigated to `/finder.html`; 390px viewport retained the old page.
- Impeccable detector ran once. It reported existing `index.html` findings and advisory token drift in `cinematic.css`; review these in a future refinement pass.

## Remaining work
- Replace the finale’s night-sky placeholder with the user-supplied Milky Way mountain video and a local poster frame.
- Improve the visual treatment and chapter transitions with more polished cloud imagery, site-specific thumbnail assets if available, and tighter lighting/camera choreography. The current cloud shell is deliberately subtle; the analog focus remains a regional globe, not terrain descent.
- Run a full desktop scroll pass at 1920×1080 and laptop sizes, including keyboard, reduced-motion, WebGL-failure, and backward-scroll behavior. The current check inspected hero and Moon plus direct Finder navigation.
- Verify each Moon/Mars target deep link from Home into `finder.html#target=…` (the Targets page is retired); refine source display for target summaries so the clickable `source_url` accompanies each claim.
- Avoid touching pre-existing unrelated repo changes: deleted `artifacts/review-pytest.txt` and untracked `scripts/generate_review_pdf.py` were present before this implementation.

## Files and decisions
- Implemented files: `web/index.html`, `web/cinematic.js`, `web/cinematic.css`.
- Plan: `C:/Users/USER/.codex/visualizations/2026/11/05/01a1ab56-1222-74c3-a04a-10325bf85cc5/plan.md`.
- Locked decisions: continuous reversible scroll; Earth-from-orbit second scene; regional Earth focus; curated historical analogs; rocket to Finder; desktop-only redesign.
- Defaults pending user correction: current logo/fonts/colors; existing catalog targets; a static night-sky finale pending video.
