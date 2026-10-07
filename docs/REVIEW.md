# Review: research doc vs mentor build guide vs this repo

Written 2026-09-28. Sources compared:

- **MD**: `EVERYTHING you need.md`, the research notes written during initial research.
- **GUIDE**: `space-apps-2026-build-guide.html`, from the Bangladesh mentors. Challenge #10 section plus the shared rules.
- **REPO**: `exo-earth` at commit `68fdc18`. I cloned it, installed it, ran it, and scored it.

Tags: **[VERIFIED]** means checked against a source or by running the code. **[VERIFY]** means we could not confirm it yet, so a teammate must check before it goes on camera.

---

## Status update (28 Sep 2026, v2): what has been fixed

| Issue | Status | How |
|---|---|---|
| C1 Known analogs scored like rainforest | **Fixed** | ROC-AUC 1.00 for both targets (`scripts/check_controls.py`). Haughton now scores 0.74 for Jezero (was 0.61); the Amazon scores 0.28 and most vegetated reference points 0. |
| C2 Aridity index misread polar deserts | **Fixed** | Replaced by NASA POWER annual precipitation, plus a new vegetation criterion (MODIS NDVI via NASA GIBS). |
| C3 Targets outside Earth's range; elevation | **Fixed** | Targets are clamped to Earth's 0.5–99.5th percentile envelope (shown in the UI); elevation is weighted 0 by default. |
| C4 Scale mismatch (slope/roughness) | **Mitigated** | Terrain targets are Earth-percentile classes with the measured value shown. A real fix needs PGDA 78 / HiRISE files (`docs/DATA_REQUESTS.md`). |
| C5 Antarctica unscored | **Fixed** | Natural Earth land mask; POWER covers Antarctica; LST gap-filled from POWER (r = 0.92). 16,992 Antarctic/sub-Antarctic cells are now scored. |
| C6 Mislabelled regions | **Fixed** | Envelopes tightened; 23 regions added (Kumtag, Turpan-Hami, Lut, Dry Valleys, ...). |
| C7 NASA-light data | **Improved** | NASA POWER, NASA GIBS MODIS NDVI, MODIS LST, NASA Blue Marble, Moon/Mars Trek imagery. |
| C8 Python 3.14 install failure | **Fixed** | Python 3.12 via `uv`; `truststore` for NASA TLS certificates on Windows. |
| Map ignored weights and custom profiles | **Fixed** | `/api/score` returns the weighted field (`include_field`). |
| No novelty badge / validation / export / new UI | **Done** | Known-analog catalog (12 sites), `/api/validation`, `/api/explain`, 3D globe UI, GeoJSON/CSV export. |

## Status update (29 Sep 2026, v3)

Added since v2: God's Eye 3D view with measured terrain statistics, discovery mode
(new sites only, spread, per-country cap, tolerance bands), Monte Carlo stability and
leave-one-out sensitivity, cross-dataset consistency checks, 3D hover previews (later replaced by God's Eye), the latest
NASA daily view, the Explore scatter, pin-to-compare, search, tour and keyboard shortcuts.

Fixed in the v3 code review: temperature-swing layers no longer use a hot/cold palette;
the list explains when filters return fewer sites than requested; region-sized analogs
(the Atacama) have footprints; the per-country cap uses real borders
(`max_per_country`); the relief image builds on request; the VIIRS label says 250 m;
links keep discovery settings; the Earth globe no longer spins by itself; the novelty
filter is precomputed (Haworth ranking 1.8 s to 0.4 s); robustness is pre-warmed at
startup; `scripts/ui_smoke.mjs` checks the interface in a headless browser.

Still open (need data or a team decision): measured terrain for the lunar sub-sites
(PGDA 78), harder validation negatives, and an ice-cover layer for the cold-trap target.

The sections below are the original review, kept for the record.

## 0. The one deadline that matters right now

| Date | What | Source |
|---|---|---|
| **1 Oct 2026, 11:59 pm** | **240-second prescreening video.** Include the team name, **every member by name**, the problem, the challenge statement, and the solution approach *as a concept*. | GUIDE, "Your three videos" |
| 28 Oct 2026 | Full challenge statements and NASA's official datasets are published. Re-check the data plan that day. | GUIDE |
| 12 Nov 2026 | A full offline dry run must succeed. | GUIDE |
| 13–14 Nov 2026 | Hackathon. The 240-second local judging video is due at 18:30 on day 1. The 30-second global video (English subtitles) is due at 12:00 on 14 Nov. | GUIDE |

The official challenge title (use it verbatim): **"Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars"**.

---

## 1. What the repo gets right (keep it)

- It follows the guide's layer rule: deterministic science lives in `src/compute`, the explainer is rule-based (`src/agents/rationale.py`), and the scoring makes no LLM calls. **[VERIFIED]**
- It runs offline. `OFFLINE=1` works, and the predictor stack is committed. **[VERIFIED]**
- Provenance: every target value has a `dataset_id`, a `source_url`, and a confidence. There is an `/api/sources` endpoint. **[VERIFIED]**
- It has the Apache-2.0 license. **[VERIFIED]**
- 30/30 tests pass on Python 3.12. **[VERIFIED]**
- It already does what the guide's challenge #10 "build" section asks for: six criteria, fixed normalisation, weight sliders, and a per-criterion breakdown.

## 2. Critical problems found by running it (fix before any number goes in a video)

Reproduce them with `OFFLINE=1 python -m scripts.check_controls`.

| # | Problem | Evidence | Fix |
|---|---|---|---|
| C1 | **Known analogs score like rainforest.** For Jezero, Haughton Crater (NASA's flagship Mars analog) scores 0.609 (12.6th percentile). The Amazon scores 0.613 and Dhaka 0.626. Mauna Kea and Askja are also below the 10th percentile. | `check_controls.py` **[VERIFIED]** | Fix C2–C5, then re-run. The goal is positives in the top 10% and negatives in the bottom 25%. |
| C2 | **The aridity index (P/PET) misreads polar deserts.** Haughton's value is 1.49, which reads as "humid", because cold places have low evapotranspiration (PET). | Predictor value at the Haughton cell **[VERIFIED]** | Use annual precipitation (mm/yr) or a snow/ice-aware dryness measure next to or instead of P/PET. Add an NDVI / ESA WorldCover "barren" gate (MD's NDVI < 0.08). |
| C3 | **Targets outside Earth's physical range.** Earth's maximum LST diurnal range is 38.7 K, but the targets are 120 K (Moon) and 86 K (Jezero). Earth's minimum elevation is −804 m against Jezero's −2600 m. Earth's maximum 0.5° slope is 4.6° against the Moon's 9.5°. So these criteria can only ever mean "higher/lower is better", and the Caspian Depression wins on elevation. | Earth predictor min/max **[VERIFIED]** | Drop **elevation** from similarity. It is not comparable across bodies, as the repo's own `units_note` says. Score ΔT against an Earth-reachable proxy (MD suggests 30–35 K) or by percentile, and label it as a proxy. |
| C4 | **Scale mismatch.** Lunar roughness is measured at a 5–10 m baseline. Earth roughness is measured over a ~28 km window. Jezero slope is at a 50 m baseline; Earth slope is at 0.5° (~55 km). | `data/targets.json` notes and README limitation #4 **[VERIFIED]** | Two-stage search. Stage 1: a coarse 0.5° screen (keep this). Stage 2: 30 m Copernicus GLO-30 slope/TRI histograms on the top ~200 cells only, compared with PGDA 78 slope histograms (Wasserstein distance, as the MD's architecture says). |
| C5 | **Antarctica and the far north are not scored.** The aridity layer has no data below ~60°S. That rules out the McMurdo Dry Valleys and Beacon Valley, which are the MD's whole "cold trap / PSR" archetype. | README limitation #2; controls **[VERIFIED]** | Build the land mask from the DEM or WorldCover instead of the aridity layer. Fill Antarctic aridity from ERA5/POWER precipitation. |
| C6 | **Mislabelled results.** Jezero result #7 (29.25°N, 67.75°E) is labelled "Thar Desert", but the nearest place is Quetta, which is Balochistan. | `/api/score` output **[VERIFIED]** | Tighten the envelopes in `data/gazetteer.json`. |
| C7 | **It looks NASA-light.** The Earth layers are WorldClim, CGIAR Global-AI, AWS Terrarium tiles and a Zenodo LST mosaic. The guide scores "NASA-data-first" and "name the dataset on camera". | `data/normalization.json` **[VERIFIED]** | Switch to NASA sources: MODIS MOD11A2 (LP DAAC), NASADEM/SRTM, NASA POWER, and LOLA PGDA 78 read directly. Keep ESA/JAXA layers as the "partner data" bonus. |
| C8 | **Wrong Python version.** It fails to install on Python 3.14 (the pinned pydantic and pillow have no wheels). | Install log **[VERIFIED]** | Use Python **3.12** (`.python-version` added). |

## 3. Discrepancies between the MD, the GUIDE and the REPO

| Topic | MD says | GUIDE says | REPO does | Decision |
|---|---|---|---|---|
| Score formula | A weighted sum with 4 weights (slope .35, roughness .25, mineral .20, ΔT .20). The architecture section says geometric, `exp(-W1/σ)`. **The formula images were lost in the PDF-to-MD conversion (lines 609–621 are blank).** | Weighted normalised linear similarity, weights shown as sliders | Linear `1-|d|/range`, 6 equal weights | Keep sliders. Move to `exp(-d/σ)` per criterion. Write the final formula in the README once and use it everywhere. |
| Resolution | 30 m everywhere; 5 m lunar DEMs downsampled to 30 m | "Coarse is correct here; you are ranking regions" | 0.5° | Both, as the two-stage search in C4. |
| Frontend | React + Vite + TS, MapLibre, three.js twin view | Static, offline, "no build step you cannot rerun without internet" | Vanilla JS test page | MapLibre with local assets. Add Vite only if `npm install` is done before the event. The 3D twin view is a stretch goal. |
| Global compute | Google Earth Engine | Offline-first; the API never calls out during the demo | Local numpy/zarr | GEE is fine **only in `src/acquire`, run before the event**. Export results to the cache. |
| ΔT target | Earth proxy of 30–35 K | MODIS LST diurnal range | Real body values: 120 K and 86 K | Earth proxy, labelled as a proxy (see C3). |
| Product name | **TerraNova** | n/a | exo-earth repo | Locked for prelim / hackathon. |
| MODIS | Main thermal source | "Terra and Aqua MODIS shutting down from late 2026" | Uses a 2000–2020 MODIS mosaic | The archive is still valid. Mention VIIRS (VNP21/VJ121) as the continuity path. |
| Required repo files | n/a | `DEVELOPMENT.md`, `AGENTS.md`, `.env.example`, `demo_fixtures/`, `docs/AI_USE.md`, `make cache/demo/test` | None of these existed | **Added in this workspace** (see §6). |

## 4. Errors and unsupported claims in the MD (do NOT put these on camera)

1. **Invented results.** The "Novel Analogs Discovered" section (Salar de Arizaro PSI 91.8%, Beacon Valley 93.4%, Makgadikgadi 88.6%) and the validation targets (Haughton ≥ 88%, Salar de Atacama ≥ 82%) came from **no code**. The real repo gives Haughton 0.609. The guide forbids "a number that no tool returned." Treat these as *hypotheses to test*, not results.
2. **Wrong temperatures.** 25–40 K is −248 °C to −233 °C. The MD uses "−248" in one place and "−246" in two others. The Earth record low is −89.2 °C (Vostok, air); satellite surface estimates near Dome Fuji are about −98 °C. The MD's "−93" is neither figure. **[VERIFY before quoting]**
3. **Copy-paste error.** Under Jezero (lines 309–313) the Gale DTM is listed as an "or". Jezero and Gale need separate DTMs. The HiRISE DTM ID `DTEEC_003798_1985_002875_1985_U01` and CRISM `FRT000047A3` must be checked on the PDS/ODE before use. **[VERIFY]**
4. **Wrong analog category.** Lake Thetis (living stromatolites) and the Dresser Formation (3.48 Ga rocks, Pilbara) are *biosignature* analogs, not "hyper-arid paleolake clay playas". The "smectite/nontronite clay beds" profile for Makgadikgadi is unsourced.
5. **Weak method.** The ilmenite/titanium proxy "Landsat B2/B4 Fe-Ti absorption" is not an established method. Lunar TiO₂ mapping uses UV/VIS ratios (~415/750 nm). Drop it or mark it experimental.
6. **Unsourced claim.** "NDVI < 0.08 eliminates more than 85% of Earth's land area" has no source. Compute the real share ourselves from MOD13A2 and quote that.
7. **Unnecessary fallback.** The N.B. about extracting Haworth/Shoemaker from Product 81: **both are already in PGDA Product 78.** **[VERIFIED on pgda.gsfc.nasa.gov/products/78]** For reference, Product 81's slope file is `ldsm_87s_5mpp` (4.9 GB) and its DEM is `ldem_87s_5mpp` (3.3 GB). **[VERIFIED]**
8. **Missed data.** Product 78 also ships `_toterr.tif` (height uncertainty) and `_slperr.tif` (slope uncertainty) for every site. Use these for the "uncertainty" the site cards promise. **[VERIFIED]**
9. **Unconfirmed site mapping.** "Site23 = Malapert Massif" and "Site01 = Connecting Ridge" are not stated on the PGDA page. Check them against Barker et al. (the paper linked from PGDA 78). **[VERIFY]**
10. **GEE ID may be outdated.** `JAXA/ALOS/PALSAR/YEARLY/SAR` may be superseded (check the GEE catalog for `SAR_EPOCH`). **[VERIFY]**
11. **Conversion damage.** Tables and equations across the MD are garbled. Treat the MD as notes, not as a document to hand in.

## 5. What we are lacking (vs the MD's MVP list and the guide's scoring)

| Needed | Status |
|---|---|
| Archetype targets (ridge, rim, cold trap, delta, sulfate mound, canyon, lava-tube pit) | Only 2 point targets exist |
| Lunar target values computed **from PGDA 78 files** (not literature numbers) | Missing |
| NDVI / barren gate | Missing |
| Mineral/spectral criterion (Landsat SWIR ratios) | Missing |
| Known-analog catalog + novelty badge (new / extension / known) | Missing |
| Validation: ROC-AUC with positive/negative controls | Baseline script only (`scripts/check_controls.py`) |
| Uncertainty on scores (Monte Carlo on target values and ranges) | Missing |
| F_ops feasibility (roads/airports, WDPA protected areas, volcano hazard) | Missing |
| Cave/lava-tube layer | Missing |
| Real map UI, site cards, radar chart, verify links (Moon/Mars Trek, LROC QuickMap), GeoJSON/CSV export | Test page only |
| `docs/AI_USE.md`, project page text, references list | Started in this workspace |
| Commits from all 6 members (Teamwork 1–5) | 3 commits, 1 author |

## 6. What was set up in this workspace

- `.venv` (Python 3.12, via `uv`). Installed; tests pass.
- `.python-version`, `.env.example`, `DEVELOPMENT.md`, `AGENTS.md`, `docs/AI_USE.md`, `demo_fixtures/README.md`.
- `scripts/check_controls.py`: the validation baseline.
- `scripts/setup.ps1`: one-command setup for Windows teammates.
- `docs/TEAM_PLAN.md`: directions plus the six work divisions.
- `docs/VIDEO_SCRIPT.md`: the 240-second prescreening script.
