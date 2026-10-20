# Team plan: 6 members, 6 divisions

Read `docs/REVIEW.md` first (10 min). It lists what's broken and why.

## Everyone: day-1 setup (today)

1. Install **git**, **uv** (`winget install astral-sh.uv`), **VS Code**, and **Node 20+** (Division 6 only).
2. Get repo access. The owner adds all 6 people as collaborators on
   `github.com/Yakiyo/exo-earth`. **Everyone commits under their own GitHub account**
   (Teamwork is scored from roles and commits).
3. Clone and set up:
   ```powershell
   git clone https://github.com/Yakiyo/exo-earth
   cd exo-earth
   powershell -File scripts/setup.ps1     # makes .venv (Py 3.12), runs tests + control check
   $env:OFFLINE="1"; .venv\Scripts\uvicorn src.api.main:app --reload   # http://127.0.0.1:8000/
   ```
4. Register the accounts you need **now** (approvals take days): NASA Earthdata Login (everyone),
   Google Earth Engine noncommercial (Div 4), OpenTopography API key (Div 4),
   Copernicus Data Space (Div 4).
5. Git workflow: one branch per task (`div2/pgda-targets`). Open a PR into `main` and get one review from
   another member. Before you push: `pytest` + `ruff check` + `python -m scripts.check_controls`.

## Timeline

| When | Milestone |
|---|---|
| **28–29 Sep** | Names, roles and product name locked. Script finalised. Setup done on all laptops. |
| **30 Sep** | Video recorded and edited. |
| **1 Oct, before 20:00** | **Prescreening video uploaded** (hard deadline 23:59). |
| 2–27 Oct | Core fixes (C1–C8 in REVIEW.md), new targets, validation. |
| 28 Oct | Official statements and datasets published. Whole team meets and compares NASA's list against ours. |
| 2–12 Nov | Cache everything, build the UI, full **offline** dry run by 12 Nov. |
| 13–14 Nov | Hackathon: 240 s local video at 18:30 on day 1; 30 s global video at 12:00 on 14 Nov. |

---

## Division 1: Lead, integration and video (Member 1)
**Now:** own the prescreening video end to end (`docs/VIDEO_SCRIPT.md`): collect the names, edit it and upload it.
Then:
- Merge PRs and keep `main` green (tests + lint).
- Keep `docs/AI_USE.md` and `docs/REFERENCES.md` (every dataset, paper and image) up to date.
- Draft the project page fields (High-Level Summary, Details, NASA data used, AI use, References).
- Keep the README aligned with the final product name and current implementation.
**Done when:** the video is uploaded on 1 Oct and the project page draft exists by 12 Nov.

## Division 2: Lunar targets (Member 2)
> **Blocked on data:** see `docs/DATA_REQUESTS.md` B. Slope and roughness targets are currently Earth-percentile classes until PGDA 78 files are processed.

**Video (by 29 Sep):** 2 screenshots of the lunar south pole (LROC QuickMap / Moon Trek) with credits.
Then:
- Download from **PGDA Product 78** (`pgda.gsfc.nasa.gov/products/78`) for Site01, Site04, Site23,
  Haworth and Shoemaker: `*_final_adj_5mpp_surf.tif`, `*_slp.tif`, `*_slperr.tif`, `*_toterr.tif`. **Not** the 100 `_err` clones or `.xyzi`.
- Confirm which site is Malapert / Connecting Ridge / Shackleton rim (Barker et al., the paper linked from PGDA 78).
- Write `src/acquire/lunar_targets.py`: slope histogram, RMS roughness and relief **computed from the files**,
  at 5 m and resampled to 30 m, with uncertainty taken from `_slperr`.
- Replace the literature numbers in `data/targets.json` with archetypes: **sunlit ridge**, **crater rim**, **cold trap (PSR)**.
- Lunar pits (Marius Hills 14.09°N 303.23°E; Mare Tranquillitatis 8.34°N 33.22°E) for the cave archetype.
**Done when:** 3 lunar archetypes are in `targets.json`, every value is computed from PGDA files, and the tests pass.

## Division 3: Mars targets (Member 3)
> **Blocked on data:** see `docs/DATA_REQUESTS.md` C.

**Video (by 29 Sep):** 2 images of Jezero / Gale (NASA/JPL/HiRISE) with credits.
Then:
- Find and **verify the IDs** of the HiRISE DTMs for Jezero and for Gale separately (PDS / Mars ODE `oderest.rsl.wustl.edu`).
  The IDs in the MD are unverified and the Jezero one is mixed up with Gale.
- Slope/roughness at a 30 m baseline from the DTMs; THEMIS thermal inertia (Mars Trek) for the thermal criterion.
- CRISM mineral classes (clay, carbonate, sulfate) as target flags for Division 5's mineral criterion.
- Add archetypes: **clay delta (Jezero)**, **sulfate mound (Gale)**, **canyon (Valles Marineris)**, **lava-tube pit (Arsia/Pavonis)**.
**Done when:** 4 Mars archetypes are in `targets.json`, fully cited, and the tests pass.

## Division 4: Earth data pipeline (Member 4)
> **Done in v2:** Antarctica land mask, NASA POWER precipitation and temperature range, GIBS MODIS NDVI, Caspian removed, LST gap fill. **Remaining:** Stage 2 (30 m GLO-30 on the top cells), Landsat mineral ratios, direct LP DAAC MODIS. See `docs/DATA_REQUESTS.md` E.

**Video (by 29 Sep):** 2 Earth images (Atacama, Haughton; NASA Earth Observatory) with credits.
Then fix these in `src/acquire/build_predictor_stack.py`:
- **C5:** a land mask that includes Antarctica and the high Arctic (from the DEM/WorldCover, not aridity).
- **C2:** add annual precipitation (NASA POWER / ERA5) and an **NDVI max < 0.08** gate (MODIS MOD13A2) plus ESA WorldCover barren/snow classes.
- **C7:** swap to NASA sources where possible: MODIS MOD11A2 LST via LP DAAC/AppEEARS, NASADEM/SRTM.
- **C6:** mask inland seas (the Caspian).
- Stage 2: for the top ~200 cells per target, fetch 30 m Copernicus GLO-30 (OpenTopography or GEE `COPERNICUS/DEM/GLO30`) → slope histogram + TRI.
- Landsat 8/9 L2 band ratios (B6/B5, B6/B7, B4/B2) over the Stage 2 cells for Division 5's mineral criterion.
**Done when:** `--offline` rebuilds the stack from cache, Antarctica is scored, and every layer has a `dataset_id` and `source_url`.

## Division 5: Scoring science and validation (Member 5)
> **Done in v2:** elevation off by default, Earth-envelope clamping, weighted geometric mean, `data/known_analogs.json` and novelty badge, ROC-AUC validation (`/api/validation`). **Remaining:** Monte Carlo uncertainty, F_ops feasibility, Wasserstein slope histograms once Stage 2 exists, replacing Wikipedia citations with NASA/USGS ones.

**Video (by 29 Sep):** a clean 3-box approach diagram (Target signature → Earth screening → Ranked, explained sites).
Then:
- **C3:** remove elevation from similarity; set Earth-reachable proxies (ΔT) and label them as proxies.
- Per-criterion `exp(-d/σ)`; histogram comparison (Wasserstein, `scipy.stats.wasserstein_distance`) for Stage 2 slopes.
- `data/known_analogs.json`: a cited catalog (USGS Terrestrial Analogs, NASA analog missions) → **novelty badge**.
- Extend `scripts/check_controls.py` into a real validation: ROC-AUC with positives vs negatives, reported in the UI.
  **Goal: positives in the top 10%, negatives in the bottom 25%.**
- Monte Carlo uncertainty (perturb target values within their stated uncertainty) → a score interval.
- F_ops feasibility as a *separate* axis: distance to roads/airports (OurAirports, OSM), WDPA protected areas, volcano hazard (Smithsonian GVP).
- Unit tests for each new function.
**Done when:** the control check passes the goal and every number comes with a test.

## Division 6: Frontend and UX (Member 6)
> **Done in v2:** three.js globe with NASA Blue Marble, flat map, target twin globe, weight sliders with live re-rank, site cards, validation tab, raw-data drawer, verify links, GeoJSON/CSV export, shareable links. **Remaining:** usability test with a stranger, keyboard walkthrough, Bangla strings (optional), archetype selector once Divisions 2 and 3 add targets.

**Video (by 30 Sep):** screen-record the current prototype (Lunar South Pole → map → ranked list) at 1080p.
Then:
- Replace the test page with **MapLibre GL** (vendored locally, no CDN at demo time): score heatmap, top-N list.
- Site card: criterion bars/radar chart, novelty badge, F_ops, uncertainty, and **provenance drawer** (raw JSON + sources).
- Target selector by archetype; weight sliders that re-rank instantly (client-side multiply on precomputed sub-scores).
- "Verify" links: NASA Moon Trek / Mars Trek, LROC QuickMap, and Google Maps at the site coordinates. GeoJSON/CSV export.
- It must work offline, on a phone (360 px wide) and with the keyboard.
- Stretch: twin 3D view (three.js) of an Earth patch next to its lunar/Mars counterpart.
**Done when:** a stranger can use it without instructions, with Wi-Fi off.

---

## Rules for everyone
1. **No invented numbers.** If the code didn't output it, it doesn't go in a slide, a video or the README.
2. Cite every dataset (id + URL) the moment you add it.
3. Log your AI usage in `docs/AI_USE.md`.
4. When behind, cut in this order: geographic scope → number of targets → interactivity → live queries.
   **Never cut the demo moment**: pick a target, the globe lights up, open a site card with its per-criterion breakdown.
