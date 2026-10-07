# TerraNova

[![NASA Space Apps Challenge 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026-005EB8?style=flat&logo=nasa&logoColor=white)](https://www.spaceappschallenge.org/)
[![Challenge](https://img.shields.io/badge/Challenge-Earth%20Analog%20Discovery-2ea043?style=flat)](https://www.spaceappschallenge.org/)
[![Team DaRK_MATTER](https://img.shields.io/badge/Team-DaRK__MATTER-f08a4b?style=flat)](https://github.com/Yakiyo/terra-nova)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue?style=flat)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)

**Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars**

Open-source discovery platform that scores **78,247** land cells on Earth (0.5° resolution, ~55 km at the equator) against published **Moon and Mars base-site profiles**, ranks the best terrestrial analogs on an interactive **3D globe**, explains every criterion with **dataset citations**, flags **novel** candidates versus catalogued sites, and validates scores against **known analog benchmarks**.

**Team DaRK_MATTER**  · [Repository](https://github.com/Yakiyo/terra-nova)

---

## Table of contents

1. [The operational bottleneck](#the-operational-bottleneck)
2. [What TerraNova does](#what-terranova-does)
3. [System architecture](#system-architecture)
4. [Scoring model](#scoring-model)
5. [Validation](#validation)
6. [NASA and partner data sources](#nasa-and-partner-data-sources)
7. [Technology stack](#technology-stack)
8. [Repository layout](#repository-layout)
9. [Quick start](#quick-start)
10. [HTTP API (summary)](#http-api-summary)
11. [Target, status, and roadmap](#target-status-and-roadmap)
12. [Team and credits](#team-and-credits)
13. [License](#license)

```powershell
powershell -File scripts/setup.ps1            # .venv on Python 3.12, installs, runs tests
$env:OFFLINE = "1"
.venv\Scripts\uvicorn src.api.main:app --reload
# open http://127.0.0.1:8000/  (Home), then Targets or Finder
```

Three pages: **Home** (`index.html`), **Targets** (`targets.html`, pick a Moon or Mars site)
and the **Finder** (`finder.html`, the globe, rankings and God's Eye). The interface follows
the design system in `DESIGN.md`.

Everything the demo needs is committed: `cache/predictors.zarr`, `cache/derived/*.npy`,
the globe textures in `web/assets/`, three.js in `web/vendor/`, and the Natural Earth
files in `cache/raw/`. It runs with Wi-Fi off.

**Targets** (`data/targets.json`), grouped by region:

| Group | Target | What it represents |
|---|---|---|
| Lunar south pole | Lunar South Pole (Shackleton rim) | Rugged, sunlit polar terrain |
| Lunar south pole | Malapert Massif | Artemis III candidate region (NASA, Oct 2024); very rugged 5 km massif |
| Lunar south pole | Haworth cold trap | Artemis III candidate region; permanently shadowed, never above ~40 K |
| Mars | Jezero Crater | Perseverance site: smooth ancient lake floor |
| Mars | Gale Crater | Curiosity site: crater floor rising into Mount Sharp |
| Your own | Custom target | Type any values; untick criteria to leave them out |

**How matching works.** Each target is a *signature*: a handful of numbers
measured on the Moon or Mars (precipitation, vegetation, temperature swings,
terrain). Every Earth land cell is scored against that one signature. It is not a
comparison of pictures. A target can leave a criterion out (`"value": null`),
for example terrain inside a shadowed crater that nobody has characterised. It can
also set its own default weights; the Haworth cold trap switches on **mean
temperature** at 2×, because "cold" is the defining challenge of a cold trap.

**Using it:** drag to spin the globe; scroll or use **+ / − / ⌂** to zoom (on the flat
map, drag to pan and double-click to zoom). Use the **Show top N** slider (5–100) to rank more or fewer sites, and the **Overlay**
slider to fade the score layer over the imagery. Hover a numbered site, a known-analog diamond
or a list entry for a satellite preview card. Rest the cursor on any land for a moment to
preview that spot. Click a site or any land for a small card with its score and a
**God's Eye 3D** button; the full breakdown opens in the sidebar.

On the map, numbered chips are the top 10, orange dots are ranks 11 and below, and rockets
are known analogs. The Moon and Mars in the background are fixed in space: drag
the globe and they come into view or slip behind you, like the stars.

**Previews** come from NASA GIBS (Blue Marble Next Generation, cloud-free, 2°×2°) and
are cached in `cache/thumbs/`. `python -m src.acquire.thumbs` prefetches the top 60 sites
per target plus every known analog (346 images, committed). With `OFFLINE=1`,
other locations fall back to a crop of the local basemap; run without `OFFLINE` to
fetch any spot live.

### God's Eye: 3D view of any site

Click a site and press **God's Eye 3D** on its card (or `E`). The app descends into a 3D
block of the site's real terrain, about 140 km across and centred on the scored 0.5° cell
(outlined in red, the site marked with a red map pin). The first visit shows a short guide to the mouse and touch controls
(**?** brings it back):

* **Terrain:** AWS Terrain Tiles at zoom 10 (~150 m), mosaicked and measured on the server
  (`src/compute/terrain.py`). The panel reports relief, mean and 90th-percentile slope, and
  the share of the cell a rover could drive (slopes under 15°). It then compares these, with
  a warning about the different baselines, against the target's own measured slope.
* **Imagery:** EOxCloudless Sentinel-2 2020 (ESA Copernicus data processed by EOX,
  CC BY-NC-SA 4.0, fine for non-commercial student projects), or plain shaded relief.
* **Sun:** any elevation and direction, with presets. **Lunar pole** sets the Sun 1.5° above
  the horizon (the Moon's spin axis is tilted only ~1.5°), with a black sky and no sky light:
  roughly how a lunar-pole site would look, lit the Moon's way.
* **Surface:** satellite, shaded relief, **Elevation**, or **Slope** (coloured by steepness, with the 15°
  rover limit marked), plus optional **contour lines** at an automatic interval.
* **Probe:** click the terrain for elevation, slope and coordinates at that point.
* **Profile:** "Measure a profile", click two points, and get the elevation profile with
  climb, descent, the steepest grade and the share over 15°. Then **Drive it** runs a rover
  marker along the path.
* **Turn the sun:** animates the Sun round the sky. Under the lunar preset it circles the
  horizon, as it does at the lunar pole.
* **Climate simulation (illustrative):** pick a month and an hour, or **Play a day**. The Sun
  follows its real path for the site's latitude; the **Thermal** surface shows an estimated
  ground temperature built from the cell's NASA POWER and MODIS numbers (cooler with height,
  warmer on sunlit slopes); **Weather** adds rain, snow or wind-blown dust and clouds in
  proportion to the cell's yearly precipitation. A picture of the climate, not a forecast.
* **True elevation:** the terrain opens at **true vertical scale (1×)**. A badge always shows
  the vertical scale, and turns amber with "Heights ×N (exaggerated)" if you raise it.
  Move the cursor over the terrain to read the real height in metres and the coordinates.
  **Elevation** mode colours the ground by height, with a legend of the block's lowest and
  highest points (the same full-resolution numbers as the stats panel).
* **Controls:** optional height exaggeration (1–6×), cell outline toggle, compass, live
  scale bar, and **Reset all**, which restores every option.

What it cannot be: a live view. The imagery is a 2020 cloud-free composite, and there is no
real-time imagery of the ground. Terrain tiles stop at about ±84° latitude, so Antarctic
interior sites have no 3D view.

Offline: terrain and imagery are cached in `cache/sitetiles/` (gitignored). Prefetch the
demo sites on the presenting laptop:
---

## The operational bottleneck

Artemis and Mars surface missions depend on **testing hardware on Earth first**—rovers, drills, habitats, navigation in shadow, and thermal extremes. Teams historically rely on a **small set of famous analogs** (e.g. Devon Island, Atacama, volcanic training fields in the U.S. Southwest, Mauna Kea).

### Discovery settings (Results tab, "Filters and weights")

The goal is new places, so by default the ranking shows **new sites only** (more than
500 km from any catalogued analog), **spread out** (at least 800 km apart, at most 2 per
country). All of this can be changed:

* **New sites only**: hide places within 500 km of a known analog.
* **Spread results**: minimum great-circle distance between results (0–2000 km).
* **Max per country**: cap how many results come from one country (Natural Earth country
  borders, so a cell counts for the country it lies in, not the nearest town's).
* **Permissible error**: turns each criterion's exact target into a band. A cell scores
  100% on that criterion anywhere within `error × confidence noise × range` of the target;
  the band is wider for low-confidence target values.

Validation always runs on the full, unfiltered score map. If the rules leave fewer sites
than you asked for, the list says so ("Only 38 of 100 requested sites meet these rules…").
All of these settings are saved in the shareable link.

### How sure are we? (robustness)

* **Stability** (badge on every site, bar in the site card): the target values are
  perturbed 48 times with noise sized by their stated confidence (high 3%, medium 8%,
  low 15% of the range, fixed seed). A site's stability is the share of runs in which it
  stays in the top 1% of land. Most top sites score 80–100%.
* **Leave one criterion out** (Validation tab): each criterion is dropped in turn and the
  whole Earth re-scored. Vegetation is the most important: without it, AUC falls to
  0.62–0.88 for four of the five targets. With any other criterion dropped it stays at 1.00.
* **Do the datasets agree?** (Validation tab): independent datasets are checked against each
  other. MODIS vs NASA POWER surface swing gives ρ = 0.92, precipitation vs NDVI 0.82,
  latitude vs seasonality 0.60, and roughness vs slope 0.52. A test fails if a data rebuild
  ever breaks this agreement.

### Map colours

| Layer | Colours |
|---|---|
| Analog score | orange, brighter = closer match (top half of land only) |
| Precipitation | teal, dark (dry) to light (wet) |
| Vegetation | tan (bare) to deep green (dense) |
| Annual temperature range, day-night swing | white (small swing) to deep orange (large swing): a swing is a size, not a temperature |
| Mean temperature | blue (cold), grey at 0 °C, red (hot) |
| Slope, roughness, elevation | pale to dark phthalo green |

Data-layer colours stop at the range that covers 99% of Earth's land.

### Seeing a place

* **Hover preview:** hovering a site shows its Blue Marble thumbnail (2° × 2°, the scored
  cell outlined).
* **Terrain relief** (site card): Sentinel-2 2020 imagery blended with a hillshade from the
  elevation tiles, so ridges and gullies read in depth. Built on demand and cached in
  `cache/peek/`; prefetch with `python -m src.acquire.peek`. The full 3D view is God's Eye.
* **Latest NASA view** (site card): NASA's newest daily image of the place (VIIRS on
  NOAA-20 via GIBS, 250 m, labelled with its date). This is as close to "live" as open
  satellite imagery gets. It may show clouds and needs internet.
* **Explore tab:** a scatter plot of any two criteria showing the ranked sites (orange
  dots), known analogs (diamonds) and the target (crosshair). Hover or click any point.

### Other tools

* **Search** (`/`): towns, deserts, known analog sites, or typed coordinates (`-24.5, -69.25`).
* **Surprise me** (`R`): fly to a random place in the top 2% that is not in your list.
* **Pin to compare** (`P`): up to three sites side by side, criterion by criterion; the best
  value in each row is highlighted.
* **Guided tour** (`T`, or **Help** > Guided tour): an 8-step walkthrough that drives the
  app. Useful for recording the demo video. **Help** also opens How it works, Data sources
  and the keyboard shortcuts.
* **Status pill** (top right): online or offline, and the current target's validation AUC;
  click it for details and a link to the Validation tab.
* **Keyboard** (`?` lists everything): `J`/`K` next/previous site, `G`/`M` globe/map,
  `+`/`-`/`0` zoom, `V` validation, `Esc` close.
* **Legend histogram:** how land cells are distributed across scores, with the top 10%
  highlighted and cells vetoed to 0% counted separately.

**Sharp imagery when zoomed.** The globe uses an 8192×4096 NASA Blue Marble
texture (4096 on GPUs that cannot take 8K). Zooming in loads NASA GIBS detail tiles:
10° tiles at ~2.2 km/px, then 2.5° tiles at ~540 m/px. Tiles are cached in `cache/tiles/`
(gitignored). To make zoomed views work with Wi-Fi off, prefetch them on the demo laptop:
No single Earth site copies the Moon or Mars:

| Mismatch | Why it matters |
|----------|----------------|
| **Multi-parameter** | Good slope ≠ good regolith chemistry ≠ barren ground ≠ correct thermal swing. |
| **No 1:1 physics** | Lunar permanently shadowed regions (~25–40 K, vacuum) cannot exist on open Earth (~−93 °C max, with atmosphere). |
| **Under-characterized globe** | Many hyper-arid, polar, and volcanic terrains are **not** in standard analog lists. |

TerraNova treats analog search as an **operational proxy problem**: match the **engineering and environmental stresses** mission hardware must survive, using **open NASA and partner geospatial data**, with **transparent, reproducible scoring**—not a black-box “AI guess.”

---

## What TerraNova does

| Capability | Description |
|------------|-------------|
| **Target profiles** | Shackleton rim, Malapert Massif, Haworth cold trap, Jezero, Gale, or a **custom** signature (`data/targets.json`). |
| **Global screening** | Every scorable land cell compared on precipitation, vegetation (NDVI), temperature ranges, MODIS LST diurnal swing, slope, and roughness. |
| **Ranked discovery** | 3D globe heatmap, top-*N* list, **novelty** (`new` / `near_known` / `known` vs `data/known_analogs.json`). |
| **Explainability** | Per-criterion similarity, weights, sources, and rule-based site cards (`src/agents/rationale.py`). |
| **Validation** | ROC-AUC vs catalog analogs and humid **negative controls**; leave-one-criterion-out and stability probes. |
| **God's Eye 3D** | Local DEM mesh (~150 m), optional Sentinel-2 drape, **lunar low-sun** preset, slope/rover-trafficability stats, GeoJSON/CSV export. |

**Design principle:** scoring at request time is **deterministic arithmetic** in `src/compute`—no LLM, no randomness, no network when `OFFLINE=1`.

For **full vision vs what this repository ships today**, see [Target, status, and roadmap](#target-status-and-roadmap).

---

## System architecture

End-to-end pipeline (offline build → online query):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. PLANETARY GROUND TRUTH (signatures)                                      │
│    Moon/Mars literature + agency products → data/targets.json               │
│    (values, earth_percentile terrain classes, weights, source_url each)     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. EARTH DATA LAYER (offline build)                                         │
│    src/acquire/build_predictor_stack.py                                     │
│    NASA POWER · GIBS MODIS NDVI · MODIS LST (Zenodo) · AWS Terrain Tiles    │
│    → cache/derived/*.npy → cache/predictors.zarr (360×720 × 8 predictors)   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. SCORING ENGINE (Python)                                                  │
│    similarity.py · validation.py · robustness.py · rationale.py             │
│    Weighted geometric mean · ranking · novelty · ROC-AUC                    │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. WEB APPLICATION                                                          │
│    FastAPI (src/api/main.py) + static web/ (Three.js globe, God's Eye)      │
│    http://127.0.0.1:8000/ · float32 score surfaces · weight sliders         │
└─────────────────────────────────────────────────────────────────────────────┘
```

**God's Eye (on demand):** `GET /api/site3d` mosaics **AWS Terrain Tiles** (Terrarium); browser loads **EOx Sentinel-2 cloudless** tiles via `/api/imagery/...` (cache under `cache/sitetiles/`).

**Architecture diagram (video / slides):** [`docs/TerraNova-architecture-video.drawio`](docs/TerraNova-architecture-video.drawio)

---

## Scoring model

### Per-criterion similarity

| Link | Opens |
|---|---|
| `finder.html#target=jezero_crater&site=1` | Jezero, the #1 site's detail card |
| `finder.html#target=malapert_massif&top=50` | Malapert Massif, top 50 sites |
| `finder.html#target=lunar_south_pole&tab=validation` | the validation tab |
| `finder.html#target=jezero_crater&view=map&layer=vegetation` | flat map, raw NDVI layer |
| `finder.html#dialog=method` | the "How it works" panel |
| `finder.html#target=lunar_south_pole&site=1&eye=1&sun=lunar` | God's Eye on the #1 site under a lunar polar sun |
| `finder.html#target=moon` / `#target=mars` / `#target=custom` | lunar south pole, Jezero, or the custom profile |

## Troubleshooting

**God's Eye or a zoomed map never finishes loading.** The first time a
site opens, the app downloads tiles from AWS (elevation), EOX (Sentinel-2) and NASA GIBS.
On a slow or filtered network that can stall. Downloads now give up after 30 s per tile and
God's Eye after 2 minutes, showing the reason and a **Retry** button. To diagnose:

```powershell
.venv\Scripts\python -m scripts.check_network    # which data host is slow or blocked
```

The reliable fix for a demo laptop is not to download there at all: copy `cache\sitetiles`,
`cache\peek` and `cache\tiles` from a laptop where the sites already opened (or run the
prefetch commands on a good connection), then start the app with `OFFLINE=1`.

**The app is sluggish right after starting on a slow PC.** It pre-computes the stability
badges in the background. Start it with `$env:EAF_WARM = "0"` to skip that.

$$
t'_k = \mathrm{clip}\bigl(t_k,\; e_{\mathrm{lo},k},\; e_{\mathrm{hi},k}\bigr)
$$

$$
s_k(x) = \mathrm{clip}\left(1 - \frac{\lvert x_k - t'_k \rvert}{\mathrm{hi}_k - \mathrm{lo}_k},\; 0,\; 1\right)
$$

Targets beyond anything on Earth (e.g. lunar 120 K day–night swing) are clipped to **Earth’s extreme** so the criterion means “as close as Earth gets.”

### Combined score (weighted geometric mean)

$$
\mathrm{score}(x) = \prod_k s_k(x)^{w_k / \sum_j w_j}
$$

Any $s_k = 0$ **vetoes** the cell (e.g. dense vegetation cannot be saved by correct slope alone).

### Criteria (Earth predictors)

| Key | Measures | Primary source |
|-----|----------|----------------|
| `precipitation` | Mean annual precipitation (mm/yr) | [NASA POWER](https://power.larc.nasa.gov/) MERRA-2 climatology 2001–2020 |
| `vegetation` | Annual max NDVI (0 = barren) | NASA GIBS `MODIS_Terra_L3_NDVI_Monthly` (2023) |
| `annual_temperature_range` | Warmest − coldest monthly mean T2M (K) | NASA POWER |
| `lst_diurnal_range` | Mean LST day − night (K) | [MODIS LST 2000–2020 (Zenodo)](https://doi.org/10.5281/zenodo.6458406); gaps filled from POWER `TS_RANGE` |
| `slope` | Regional slope of 0.5° DEM (°) | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) |
| `roughness` | RMS height ~28 km window (m) | AWS Terrain Tiles |
| `mean_annual_temperature` | Mean monthly T2M (°C) | NASA POWER (default weight 0; **Haworth** enables 2× for cold-trap proxy) |
| `elevation` | Mean elevation (m) | AWS Terrain Tiles (default weight 0) |

Land mask: Natural Earth 1:50m land minus lakes; cell scorable if ≥50% land.

### Lunar cold traps (operational proxy)

Absolute lunar PSR temperatures (~40 K) are **not** matched on Earth. For **Haworth**, the engine emphasizes **mean annual temperature** and literature cold-trap context instead of impossible Kelvin equality. **Planned:** ESA CCI permafrost (MAGT ≤ 0 °C) as cryic-soil layer ([`docs/DATA_REQUESTS.md`](docs/DATA_REQUESTS.md)).

---

## Validation

Catalog: **`data/known_analogs.json`** (USGS-style analogs, Apollo training sites, polar deserts, plus **negative controls**—Amazon, Congo, cropland, etc.).

| Check | Result (current build) |
|-------|----------------------|
| **ROC-AUC** (analog-like vs humid/vegetated controls) | **1.00** on all five built-in targets |
| **Leave-one-out** | Dropping **vegetation** hurts separation most; other criteria often leave AUC at 1.00 |
| **Cross-dataset checks** | e.g. MODIS LST swing vs POWER TS_RANGE ρ ≈ 0.92 ([`/api/datachecks`](http://127.0.0.1:8000/api/datachecks)) |

Reproduce:

```bash
python -m pytest tests -q                       # 74 tests, no network
node scripts/ui_smoke.mjs                       # 28 browser checks (needs the app running and Chrome)
python -m ruff check src tests scripts conftest.py
OFFLINE=1 python -m scripts.check_controls      # validation table for every target
```

**Interpretation:** validation shows the score **separates barren/analog-like land from rainforests and humid farmland** on a 0.5° grid—it is a **screening tool**, not a field geologic survey. See [Target, status, and roadmap](#target-status-and-roadmap).

Example control percentiles (lunar south pole target, from `check_controls`):

| Site | Role | Typical outcome |
|------|------|-----------------|
| Meteor Crater, AZ | Positive (lunar training geology) | High percentile |
| McMurdo Dry Valleys | Positive (Mars/polar analog) | High on cold targets |
| Amazon / Congo rainforest | Negative | **~0%** score, bottom percentiles |
| Atacama Desert | Positive (hyper-arid) | Strong on Mars-like targets |

---

## NASA and partner data sources

### Earth predictor stack (global 0.5° scoring)

| Dataset | Agency / host | Role in TerraNova | Access |
|---------|---------------|-------------------|--------|
| MERRA-2 climatology | NASA [POWER](https://power.larc.nasa.gov/) | Precipitation, T2M range, mean temperature | API / build script |
| MODIS Terra NDVI (MOD13C2) | NASA [GIBS](https://nasa-gibs.github.io/gibs-api-docs/) | Vegetation / abiotic mask | PNG tiles → decode |
| MODIS Terra LST 2000–2020 | LP DAAC via [Zenodo 6458406](https://doi.org/10.5281/zenodo.6458406) | Diurnal thermal swing | GeoTIFF → `lst_modis.npy` |
| Terrain (SRTM/GMTED/ETOPO1) | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) | Elevation, slope, roughness | Terrarium PNG |
| Natural Earth | Natural Earth | Land/ocean mask, country borders, gazetteer | GeoJSON in `cache/raw/` |

### Planetary target signatures (literature + agency references)

| Body | Sites in app | Ground-truth inputs (cited in `targets.json`) |
|------|--------------|-----------------------------------------------|
| **Moon** | Shackleton rim, Malapert, Haworth PSR | LRO LOLA / Diviner literature, Artemis III regions (NASA 2024), peer-reviewed polar studies |
| **Mars** | Jezero, Gale | MOLA/HRSC context, REMS/MEDA climate tables, rover landing literature |

**Next ingestion (hackathon):** NASA [PGDA Product 78](https://pgda.gsfc.nasa.gov/products/78) 5 m LOLA site DEMs/slope; HiRISE/CRISM site tiles for Mars mineralogy ([`docs/DATA_REQUESTS.md`](docs/DATA_REQUESTS.md)).

### Visualization and God's Eye (not used in global score)

| Dataset | Role |
|---------|------|
| NASA Blue Marble / GIBS WMTS | Globe basemap, cell thumbnails |
| EOx Sentinel-2 cloudless 2020 | God's Eye imagery (CC BY-NC-SA 4.0) |
| AWS Terrain Tiles z10 | God's Eye DEM, peek hillshade |
| [Moon Trek](https://trek.nasa.gov/moon/) / [Mars Trek](https://trek.nasa.gov/mars/) | External verify links in UI |

Full provenance JSON: **`GET /api/sources`**.

---

## Technology stack

| Layer | Technology |
|-------|------------|
| Scoring | Python 3.12, NumPy, Zarr, SciPy |
| API | [FastAPI](https://fastapi.tiangolo.com/) + Uvicorn |
| Frontend | Vanilla JS, **Three.js** (WebGL globe + God's Eye) |
| Storage | Committed `predictors.zarr`, GeoJSON configs, optional `cache/sitetiles/` |
| Tests | pytest, ruff |

---

## Repository layout

```
terra-nova/
├── data/
│   ├── targets.json           # Moon/Mars target signatures + citations
│   ├── normalization.json     # Ranges, Earth envelope, default weights
│   ├── known_analogs.json     # Catalog + validation controls
│   └── gazetteer.json         # Place-name search
├── cache/
│   ├── predictors.zarr        # 360×720 Earth predictor stack (committed)
│   ├── raw/                   # Natural Earth, etc.
│   └── sitetiles/             # God's Eye DEM/S2 (local prefetch, gitignored)
├── src/
│   ├── acquire/               # Offline download + build_predictor_stack
│   ├── compute/               # similarity, validation, terrain, robustness
│   ├── agents/rationale.py    # Rule-based explanations
│   └── api/main.py            # FastAPI + static web/
├── web/                       # index.html, app.js, globe.js, godseye.js, …
├── scripts/                   # setup.ps1, check_controls.py
├── tests/
└── docs/                      # VIDEO_SCRIPT, DATA_REQUESTS, architecture draw.io
```

---

## Quick start

### Windows (recommended)

Requires [git](https://git-scm.com/) and [uv](https://github.com/astral-sh/uv) (`winget install astral-sh.uv`):

```powershell
git clone -b feature/v2-nasa-data-globe https://github.com/Yakiyo/terra-nova.git
cd terra-nova
powershell -File scripts/setup.ps1
$env:OFFLINE = "1"
.venv\Scripts\uvicorn src.api.main:app --host 127.0.0.1 --port 8000 --reload
```

Open **http://127.0.0.1:8000/**

Alternative launcher (if present locally): `powershell -File start-app.ps1` with `OFFLINE=0` to fetch missing God's Eye tiles live.

### Linux / macOS

```bash
git clone -b feature/v2-nasa-data-globe https://github.com/Yakiyo/terra-nova.git
cd terra-nova
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
OFFLINE=1 .venv/bin/uvicorn src.api.main:app --host 127.0.0.1 --port 8000
```

### God's Eye offline prefetch

```bash
OFFLINE=0 python -m src.acquire.sitetiles --top 5
```

### Tests

```bash
python -m pytest tests -q
python -m ruff check src tests scripts conftest.py
OFFLINE=1 python -m scripts.check_controls
```

---

## HTTP API (summary)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Grid shape, candidate cells, offline flag, build time |
| `GET` | `/api/criteria` | Ranges, Earth envelope, units, sources, default weights |
| `GET` | `/api/targets` | Targets with every criterion's value, Earth-effective value and citation |
| `POST` | `/api/score` | Rank cells for a target or custom profile. `include_field: true` also returns the weighted score surface |
| `POST` | `/api/explain?lat=&lon=` | Full breakdown for any location, in the same shape as a ranked result |
| `GET` | `/api/validation?target_id=` | ROC-AUC and control-site percentiles |
| `GET` | `/api/analogs` | The known-analog catalog |
| `GET` | `/api/scorefield` | Score surface, base64 float32 |
| `GET` | `/api/predictor?key=` | One raw predictor grid |
| `GET` | `/api/cell?lat=&lon=` | Raw values, label and novelty for one cell |
| `GET` | `/api/thumb?lat=&lon=` | NASA Blue Marble preview JPEG of the cell (cached; 404 offline if not cached) |
| `GET` | `/api/tile/{z}/{row}/{col}.jpg` | Detail imagery tile (levels 1–2; cached, 404 offline if not cached) |
| `GET` | `/api/site3d?lat=&lon=&target_id=` | God's Eye terrain: 256×256 heightmap, cell outline, relief and slope statistics |
| `GET` | `/api/imagery/s2/{z}/{x}/{y}.jpg` | Sentinel-2 cloudless imagery tile for God's Eye (cached) |
| `GET` | `/api/search?q=` | Places, regions, known analogs or `lat, lon` |
| `POST` | `/api/robustness` | Monte Carlo stability of the ranked sites and leave-one-criterion-out sensitivity |
| `GET` | `/api/datachecks` | Agreement between independent datasets (Spearman ρ) |
| `GET` | `/api/peek?lat=&lon=` | Relief-shaded Sentinel-2 preview and a 64×64 heightmap |
| `GET` | `/api/sources` | Every dataset, target citation, basemap credit and the LST gap-fill fit |

---

## Target, status, and roadmap

### North-star target (TerraNova)

End-to-end analog discovery for Artemis and Mars surface ops:

1. **Planetary ground truth** — Site-scale signatures from NASA products (e.g. **PGDA LOLA Product 78** for lunar south-pole DTMs, **HiRISE/CTX** and **CRISM** for Mars) with cited literature bounds in `targets.json`.
2. **Global Earth screening** — Multi-stage funnel (vegetation/barren gates → thermal and aridity → **30 m** terrain where survivors warrant it), using **NASA-first** layers plus partner DEMs (e.g. **Copernicus GLO-30**) where they fill polar or resolution gaps.
3. **Transparent scoring** — Weighted geometric mean (any zero similarity vetoes the cell), explainable per-criterion breakdown, novelty vs catalog sites.
4. **Field context** — Operational access masks (`F_ops`), optional **cave/skylight** proxy layer, and site-scale **God’s Eye** terrain for mission rehearsal.

Scoring stays **deterministic code** in `src/compute`; AI assistants may help build the repo but **never** produce rank scores.

### Shipped in this repository (Space Apps 2026 MVP)

| Area | In this repo |
|------|----------------|
| **Targets** | Five built-in Moon/Mars profiles + custom JSON (`data/targets.json`); terrain slopes/roughness via **Earth-percentile classes** tied to literature, not yet PGDA/HiRISE rasters |
| **Earth stack** | Prebuilt **0.5°** predictor cube (`cache/predictors.zarr`): NASA POWER, GIBS MODIS NDVI, MODIS LST (Zenodo) + gap-fill, AWS Terrain Tiles slope/roughness |
| **Scoring & validation** | Geometric mean, Earth-envelope target clamping, ROC-AUC vs known analogs and negative controls |
| **UI** | **FastAPI** + static **Three.js** globe, weight sliders, rule-based rationale cards, **God’s Eye** 3D (~150 m Terrarium + Sentinel-2 drape) |
| **Novelty** | Distance to **12** catalogued analog sites (`data/known_analogs.json`) |

This MVP proves **global screening + explainable ranks + local terrain preview** on open NASA-centric data at hackathon scale.

### Not yet implemented (gaps vs full vision)

| Planned capability | Status in this repo |
|--------------------|---------------------|
| **PGDA Product 78** (5 m lunar DEM/slope at site folders) downsampled to **30 m** for fair compare with Earth DEM | Not ingested; lunar terrain targets use percentile classes |
| **HiRISE/CTX** site DTMs + **CRISM** mineral / hydration ratios for Mars targets | Not in predictor stack |
| **GEE (or equivalent) multi-stage screening funnel** @ 1 km → 30 m on survivor tiles | Single global 0.5° pass only |
| **Copernicus GLO-30** as primary global elevation (polar coverage) | AWS Terrarium / derived slopes at 0.5° only |
| **ESA CCI permafrost** (MAGT) for PSR / cryic-soil proxy (e.g. Haworth mode) | Documented plan; see Haworth note in [Scoring model](#scoring-model) and [`docs/DATA_REQUESTS.md`](docs/DATA_REQUESTS.md) |
| **Operational access** (`F_ops`: roads, WDPA, hazards) | Not scored |
| **Cave / lava-tube skylight** detection layer (LROC / HiRISE pit catalogs) | Not scored |
| **React + MapLibre** production frontend | Not in repo; current demo is Three.js + FastAPI |

Team backlog and dataset requests: [`docs/DATA_REQUESTS.md`](docs/DATA_REQUESTS.md). Mentor-style gap analysis: [`docs/REVIEW.md`](docs/REVIEW.md).

### Known limits (current MVP)

1. **0.5° cells (~55 km)** average small features with surroundings—not a substitute for 30 m field geology.
2. **Terrain targets** use Earth-percentile **classes** until PGDA/HiRISE site DTMs are ingested.
3. **Polar scoring** gaps where elevation tiles and MODIS LST are missing (gap-fill documented in `/api/sources`).
4. **Novelty** is distance to a **12-site** catalog—not a claim of “never studied anywhere.”
5. **Physics ceiling:** open-Earth sites cannot replicate lunar PSR vacuum or exact regolith chemistry; scores mean **best terrestrial proxy** for listed stresses.

### Roadmap (post-MVP / extended hackathon)

| Phase | Focus |
|-------|--------|
| **A — Planetary truth** | Ingest PGDA 78 + Mars ODE DTMs; refresh `targets.json` with measured slope/TRI/thermal stats |
| **B — Earth resolution** | GEE funnel + Copernicus 30 m tiles; optional CRISM/M3-style mineral features where data allow |
| **C — Mission ops** | Permafrost layer, `F_ops` masks, cave/skylight module; richer novelty catalog |
| **D — Product UI** | React + MapLibre map client on the same FastAPI scoring API |

---

## Team and credits

**Team DaRK_MATTER** — NASA Space Apps Challenge 2026 · Khulna, Bangladesh

| Member | Role (fill for submission) |
|--------|---------------------------|
| *Rafsan Kabir* | Project lead / integration |
| *Sazidul Karim Saad* | Lunar targets & validation |
| *Mahfuz Kamal Sohan* | Mars targets & science narrative |
| *Rayat Bin Nasir* | Earth data pipeline |
| *Nafi Abrar Chowdhury* | Scoring & robustness |
| *Farhan Fuad* | Frontend & demo |

Repository: **https://github.com/Yakiyo/terra-nova**

---

## License

| Path | What it is |
|---|---|
| `src/acquire/` | Downloaders and the build: `landmask`, `power`, `gibs_ndvi`, `basemaps`, `build_predictor_stack`, `calibrate` |
| `src/compute/similarity.py` | Scoring model: ranges, Earth envelope, weights, geometric mean, ranking |
| `src/compute/validation.py` | ROC-AUC validation and the novelty label |
| `src/compute/terrain.py` | God's Eye terrain maths: tile geometry, Terrarium decoding, slope, relief and hillshade |
| `src/compute/robustness.py` | Monte Carlo stability and leave-one-criterion-out sensitivity |
| `src/compute/datachecks.py` | Cross-dataset consistency checks |
| `src/compute/gazetteer.py` | Offline place names (82 region envelopes + Natural Earth places) |
| `src/agents/rationale.py` | Rule-based explainer (not a language model); every claim carries a source |
| `src/api/main.py` | FastAPI app |
| `data/` | `targets.json`, `normalization.json`, `known_analogs.json`, `gazetteer.json` |
| `web/` | Pages `index.html` (Home), `targets.html`, `finder.html`; `styles.css`; `app.js` (Finder), `welcome.js`, `targets.js`, `globe.js`, `flatmap.js`, `godseye.js`, `climate.js`, `space.js`, `colors.js`, `ui.js`, `icons.svg`; `assets/`, `vendor/` (three.js, fonts) |
| `DESIGN.md` | The interface design system: tokens, type, icons, motion |
| `docs/` | `REVIEW.md`, `TEAM_PLAN.md`, `VIDEO_SCRIPT.md`, `AI_USE.md`, `DATA_REQUESTS.md` |

## Known limitations

1. **Resolution.** Cells are 0.5° (~55 km), so small features are averaged with their
   surroundings. Mauna Kea's cell includes forested slopes; the Dry Valleys share their
   cell with ice.
2. **Terrain targets are classes, not measurements.** Matched-scale slope statistics
   from PGDA Product 78 and HiRISE DTMs are the next step (see `docs/DATA_REQUESTS.md`).
3. **Reanalysis precipitation.** NASA POWER (MERRA-2) can overestimate polar deserts:
   Haughton reads 342 mm/yr.
4. **LST gap fill.** Where MODIS has no data (mainly Antarctica, 24,190 cells), the
   day-night swing is predicted from POWER `TS_RANGE` (linear fit, r = 0.92).
5. **Latitude limits.** The elevation tiles stop at ±85.05°, so the far polar interiors
   are not scored.
6. **Sub-sites at one pole look alike at this resolution.** Malapert Massif and the
   Shackleton rim share the same polar thermal data and differ only in terrain class, so
   their Earth rankings are similar. Measured slope maps (PGDA Product 78) would separate
   them; see `docs/DATA_REQUESTS.md`.
7. **The cold trap matches ice sheets.** Earth's coldest, driest land is the East Antarctic
   plateau, which is ice, not ice-cemented regolith. Telling ice sheets apart from ice-free
   permafrost (the Dry Valleys) needs an ice-cover layer.
8. **NDVI decoding.** GIBS NDVI is decoded to the lower edge of each 0.005-wide colour bin,
   and "no data", water, ice and snow all read as 0 (no vegetation).
9. **Novelty is distance-based.** "New" means more than 500 km from any catalogued analog's
   footprint. The catalog is 12 sites; large regions (the Atacama) carry an extent, but a
   place can be "new" to this catalog and still have been studied elsewhere.

## Licence and credits

Code is Apache-2.0 (see [LICENSE](LICENSE)). three.js is MIT (`web/vendor/three/LICENSE`).
Data sources keep their own terms; every dataset is listed in the app under **Data
sources** and in `/api/sources`. Imagery: NASA Blue Marble Next Generation, NASA Moon
Trek (LRO WAC), NASA Mars Trek (Viking MDIM 2.1). God's Eye imagery: EOxCloudless
https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel
data 2020), CC BY-NC-SA 4.0. God's Eye terrain: AWS Terrain Tiles. Place names: Natural
Earth (public domain).
