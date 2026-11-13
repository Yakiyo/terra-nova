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

---

## The operational bottleneck

Artemis and Mars surface missions depend on **testing hardware on Earth first**—rovers, drills, habitats, navigation in shadow, and thermal extremes. Teams historically rely on a **small set of famous analogs** (e.g. Devon Island, Atacama, volcanic training fields in the U.S. Southwest, Mauna Kea).

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
| **Target profiles** | Shackleton rim, Malapert Massif, Haworth cold trap, **Marius Hills lava-tube skylight**, Jezero, Gale, **Utopia Planitia ice-rich ground**, or a **custom** signature (`data/targets.json`). |
| **Global screening** | All 78,247 scorable land cells (0.5° grid) compared on **nine** conditions: precipitation, vegetation (NDVI), annual temperature range, MODIS LST day-night swing, slope, roughness, elevation, mean temperature and basaltic volcanic rock. |
| **Ranked discovery** | 3D globe heatmap, top-*N* list, **novelty** (`new` / `near_known` / `known` vs `data/known_analogs.json`). |
| **Explainability** | Per-criterion similarity, weights, sources, and rule-based site cards (`src/agents/rationale.py`). |
| **Validation** | ROC-AUC vs catalog analogs and humid **negative controls**, shown as a ROC curve, a separation strip plot, leave-one-dataset-out bars and dataset-agreement bars. **Explore** plots every land cell on Earth as a density cloud with presets (Climate, Thermal, Terrain). |
| **God's Eye 3D** | Local DEM mesh (~150 m), optional Sentinel-2 drape, **lunar low-sun** preset, slope/rover-trafficability stats, GeoJSON/CSV export. |
| **EVA traverse and mission dossier** | In God's Eye, plan up to 8 waypoints (Basecamp, Science Station, Drill Site…). The server measures elevation, grade, climb, hazards over 15° and Tobler walking time on the full-resolution tiles (`src/compute/traverse.py`). Export a printable, fully cited mission dossier (HTML) and the route as GeoJSON. |
| **Earth processes (context)** | For every site, NASA **MERRA-2 dust** and **MODIS snow/ice** months, plain-language processes (dust storms, permafrost, hyper-arid soil, volcanic basalt, day-night swings), the nearest analog cave or lava tube, and what Earth cannot reproduce (low gravity, vacuum, radiation). Shown, not scored (`/api/context`). |
| **Drag-to-compare** | Wipe between the real Moon/Mars surface (NASA Image Library) and the Earth site. |
| **Learn page** | `learn.html?world=mars` / `moon`: interactive day and dust slider, missions and the Earth sites they were tested at, Moon/Mars vs Earth processes, a "Be the scientist" challenge and a quiz. |
| **Guided tour** | A 60-second tour (button beside the globe) that walks through targets, matches, a site dossier, a self-playing God's Eye demo on the Karakoram (day, relief, rover drive) and validation. |
| **Hardware test readiness** | For any site: could a VIPER-class ice drill, low-sun navigation, a spacesuit or a rover be field-tested here (TRL 5-6)? Four categories, each requirement with its value, a sourced threshold and pass / near / fail (`src/compute/qualification.py`). |

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
│    → cache/derived/*.npy → cache/predictors.zarr (360×720 × 9 predictors)   │
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


---

## Scoring model

### Per-criterion similarity

For criterion $k$, stored editorial range $[\mathrm{lo}_k, \mathrm{hi}_k]$, Earth envelope $[e_{\mathrm{lo},k}, e_{\mathrm{hi},k}]$, cell value $x_k$, and target $t_k$:

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
| `mean_annual_temperature` | Mean monthly T2M (°C) | NASA POWER (default weight 0; enabled by **Haworth** 2×, **Utopia** 2× and the **lava tube** 1×) |
| `elevation` | Mean elevation (m) | AWS Terrain Tiles (default weight 0) |
| `basaltic_volcanic` | Dominant rock class: basalt 1, intermediate volcanic 0.5, other 0 | [GLiM](https://doi.org/10.1594/PANGAEA.788537) gridded to 0.5° (default weight 0; the **lava tube** target enables 2×) |

Land mask: Natural Earth 1:50m land minus lakes; cell scorable if ≥50% land.

### Lava tubes and ground ice (archetypes)

Two targets go beyond surface sites (spec and sources: [`docs/WINNING_FEATURES.md`](docs/WINNING_FEATURES.md)):

* **Marius Hills lava-tube skylight (Moon):** a habitat inside a lava tube. Deep lunar lava tubes
  keep a stable ~17 °C and form in basaltic lava, so the Earth match is **basaltic lava fields in a mild,
  stable climate**: a new rock-type layer (GLiM) weighted 2× plus mean temperature. The five catalogued
  lava-tube sites (Craters of the Moon, Lava Beds, Lava River Cave, Víðgelmir, Undara) all rank in Earth's
  top 2% for this target.
* **Utopia Planitia ice-rich ground (Mars):** water for In-Situ Resource Utilization from buried ice
  (MRO SHARAD). Matched to Earth's cold, barren, dry **continuous-permafrost** regime (20th-percentile mean
  temperature, about −24 °C), validated on Devon Island, Axel Heiberg and the McMurdo Dry Valleys.

### Lunar cold traps (operational proxy)

Absolute lunar PSR temperatures (~40 K) are **not** matched on Earth. For **Haworth**, the engine emphasizes **mean annual temperature** and literature cold-trap context instead of impossible Kelvin equality. **Planned:** ESA CCI permafrost (MAGT ≤ 0 °C) as cryic-soil layer ([`docs/DATA_REQUESTS.md`](docs/DATA_REQUESTS.md)).

---

## Validation

Catalog: **`data/known_analogs.json`** (16 catalogued analog sites, each with its English Wikipedia source: Apollo training sites, polar deserts, lava tubes, impact structures; plus **negative controls**: Amazon, Congo, cropland, etc.).

| Check | Result (current build) |
|-------|----------------------|
| **ROC-AUC** (analog-like vs humid/vegetated controls) | **1.00** on all seven built-in targets |
| **Leave-one-out** | Dropping **vegetation** hurts separation most; other criteria often leave AUC at 1.00 |
| **Cross-dataset checks** | e.g. MODIS LST swing vs POWER TS_RANGE ρ ≈ 0.92 ([`/api/datachecks`](http://127.0.0.1:8000/api/datachecks)) |

Reproduce:

```bash
OFFLINE=1 python -m scripts.check_controls
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
| Global Lithological Map (GLiM, 0.5°) | Hartmann & Moosdorf 2012, [PANGAEA](https://doi.org/10.1594/PANGAEA.788537), CC-BY 3.0 | Basaltic volcanic rock (lava-tube target) | ASCII grid → `basaltic_volcanic.npy` (`python -m src.acquire.glim`) |
| MERRA-2 dust surface mass concentration (monthly 2023) | NASA GMAO via [GIBS](https://nasa-gibs.github.io/gibs-api-docs/) | Dust context per site (not scored) | `python -m src.acquire.context_layers` → `cache/context.npz` |
| MODIS Terra L3 snow cover (monthly 2023) | NASA via [GIBS](https://nasa-gibs.github.io/gibs-api-docs/) | Snow/ice months per site (not scored) | same command |

### Planetary target signatures (literature + agency references)

| Body | Sites in app | Ground-truth inputs (cited in `targets.json`) |
|------|--------------|-----------------------------------------------|
| **Moon** | Shackleton rim, Malapert, Haworth PSR, Marius Hills skylight | LRO LOLA / Diviner literature, Artemis III regions (NASA 2024), peer-reviewed polar studies, LROC Lunar Pit Atlas |
| **Mars** | Jezero, Gale, Utopia Planitia | MOLA/HRSC context, REMS/MEDA climate tables, rover landing literature, MRO SHARAD ice (NASA JPL 2016), NSSDC Mars fact sheet |

**Next ingestion (hackathon):** NASA [PGDA Product 78](https://pgda.gsfc.nasa.gov/products/78) 5 m LOLA site DEMs/slope; HiRISE/CRISM site tiles for Mars mineralogy ([`docs/DATA_REQUESTS.md`](docs/DATA_REQUESTS.md)).

### Visualization and God's Eye (not used in global score)

| Dataset | Role |
|---------|------|
| NASA Blue Marble / GIBS WMTS | Globe basemap, cell thumbnails |
| EOx Sentinel-2 cloudless 2020 | God's Eye imagery (CC BY-NC-SA 4.0) |
| AWS Terrain Tiles z10 | God's Eye DEM, peek hillshade |
| [Moon Trek](https://trek.nasa.gov/moon/) / [Mars Trek](https://trek.nasa.gov/mars/) | External verify links in UI |
| [NASA Image and Video Library](https://images.nasa.gov/) | Learn page and drag-to-compare photos (loaded live) |
| Curated analog caves (`data/caves.json`) | Nearest lava tube / cave per site |

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
└── docs/                      # WINNING_FEATURES, DATA_REQUESTS, VIDEO_SCRIPT, AI_USE
```

---

## Quick start

### Windows (recommended)

Requires [git](https://git-scm.com/) and [uv](https://github.com/astral-sh/uv) (`winget install astral-sh.uv`):

```powershell
git clone https://github.com/Yakiyo/terra-nova.git
cd terra-nova
powershell -File scripts/setup.ps1
$env:OFFLINE = "1"
.venv\Scripts\python.exe -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000 --reload
```

Open **http://127.0.0.1:8000/**

Run commands from the repository root. Keep the server terminal open while using the app.

### Git Bash on Windows

Git Bash uses the Windows virtual environment layout (`.venv/Scripts`), even though
the shell accepts Bash syntax. From the repository root, with `uv` installed:

```bash
uv venv --python 3.12 .venv
uv pip install --python .venv/Scripts/python.exe -r requirements.txt
OFFLINE=1 .venv/Scripts/python.exe -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000/**. No environment activation is needed for these commands.

### Linux / macOS

```bash
git clone https://github.com/Yakiyo/terra-nova.git
cd terra-nova
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
OFFLINE=1 .venv/bin/python -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000
```

These paths also apply inside WSL; create the environment inside WSL rather than
reusing a Windows `.venv`.

### Troubleshooting startup

- `.venv/bin/uvicorn: No such file or directory` in Git Bash: use the Windows
  commands above with `.venv/Scripts/python.exe`.
- `No module named uvicorn`: install `requirements.txt` using the same environment
  Python path used to start the server. Creating a virtual environment alone does
  not install dependencies.
- `OFFLINE=1` is Bash syntax. In PowerShell, set `$env:OFFLINE = "1"` before
  starting the server.
- For the `python` commands below, first activate the project environment:
  `source .venv/Scripts/activate` in Git Bash, `source .venv/bin/activate` on
  Linux/macOS, or `.\.venv\Scripts\Activate.ps1` in PowerShell. Alternatively,
  replace `python` with the explicit environment Python path shown above.

### Offline demo prefetch (run once, online, before the demo)

**Needed before an offline demo.** God's Eye, the hover previews and the detail imagery
only work offline for places whose tiles are cached. The prefetch scripts rank every
target exactly as the Finder does (its discovery filters and each target's default
weights), so the cached sites are the ones the Finder lists. With internet access:

```powershell
$env:OFFLINE = "0"
.venv\Scripts\python -m src.acquire.sitetiles          # God's Eye terrain + imagery, top 20 of every target
.venv\Scripts\python -m src.acquire.peek               # hover previews
.venv\Scripts\python -m src.acquire.thumbs             # Blue Marble thumbnails
.venv\Scripts\python -m src.acquire.tiles --level 2 --around-top 20   # detail map imagery
```

Run it again after any change to targets, weights or data, then check offline:
`$env:OFFLINE = "1"` and open God's Eye on a few results of each target.

### Tests

```bash
python -m pytest tests -q
python -m ruff check src tests scripts conftest.py
OFFLINE=1 python -m scripts.check_controls
```

---

## HTTP API (summary)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Readiness: predictor stack present, offline flag, grid shape |
| `GET` | `/api/criteria` | Criteria, units, Earth ranges and default weights |
| `POST` | `/api/score` | Rank cells for a target; optional full score field |
| `POST` | `/api/robustness` | Stability of the ranked sites (Monte Carlo) and leave-one-criterion-out |
| `POST` | `/api/explain` | Breakdown for any lat/lon |
| `GET` | `/api/validation` | ROC-AUC and control-site table |
| `GET` | `/api/datachecks` | Do independent datasets agree? (Spearman correlations) |
| `GET` | `/api/scorefield` | The whole score surface for map rendering |
| `GET` | `/api/predictor` | One raw predictor grid |
| `GET` | `/api/cell` | Predictors, label, novelty and provenance for one coordinate |
| `GET` | `/api/search` | Find a place: analogs, regions, towns or "lat, lon" |
| `GET` | `/api/analogs` | The known-analog catalogue |
| `GET` | `/api/site3d` | God's Eye heightmap + terrain statistics (incl. how much of the cell the block covers) |
| `POST` | `/api/traverse` | EVA route analysis on a site's God's Eye terrain: 2-8 waypoints → profile, legs, hazards, walking time |
| `GET` | `/api/context` | Unscored site context: MERRA-2 dust, MODIS snow/ice months, Earth processes, nearest analog caves |
| `GET` | `/api/datachecks` | Cross-dataset agreement (Spearman ρ) |
| `GET` | `/api/qualification` | Hardware test readiness matrix for a lat/lon (`terrain=1` uses the site terrain for the rover) |
| `GET` | `/api/targets`, `/api/sources` | Catalog and provenance |
| `GET` | `/api/thumb`, `/api/peek`, `/api/peek.jpg`, `/api/tile/...`, `/api/imagery/...` | Cached imagery for previews, the map and God's Eye (404 offline when not cached) |

Interactive docs: **http://127.0.0.1:8000/docs** when the server is running.

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
| **Targets** | Seven built-in Moon/Mars profiles (including a lava-tube habitat and an ice-rich ISRU site) + custom JSON (`data/targets.json`); terrain slopes/roughness via **Earth-percentile classes** tied to literature, not yet PGDA/HiRISE rasters |
| **Earth stack** | Prebuilt **0.5°** predictor cube (`cache/predictors.zarr`): NASA POWER, GIBS MODIS NDVI, MODIS LST (Zenodo) + gap-fill, AWS Terrain Tiles slope/roughness, GLiM basaltic rock |
| **Scoring & validation** | Geometric mean, Earth-envelope target clamping, ROC-AUC vs known analogs and negative controls |
| **UI** | **FastAPI** + static **Three.js** globe, weight sliders, site dossiers with drag-to-compare and Earth-process context, **God’s Eye** 3D (~150 m Terrarium + Sentinel-2 drape) with a tabbed console and rover traverse, a guided tour, and an interactive **Learn** page for the Moon and Mars |
| **Novelty** | Distance to **16** catalogued analog sites (`data/known_analogs.json`) |

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
| **Cave / lava-tube skylight** detection layer (LROC / HiRISE pit catalogs) | Partly: the lava-tube target scores basaltic rock (GLiM); individual caves are not detected |
| **React + MapLibre** production frontend | Not in repo; current demo is Three.js + FastAPI |

Team backlog and dataset requests: [`docs/DATA_REQUESTS.md`](docs/DATA_REQUESTS.md). Mentor-style gap analysis: [`docs/REVIEW.md`](docs/REVIEW.md).

### Known limits (current MVP)

1. **0.5° cells (~55 km)** average small features with surroundings—not a substitute for 30 m field geology.
2. **Terrain targets** use Earth-percentile **classes** until PGDA/HiRISE site DTMs are ingested.
3. **Polar scoring** gaps where elevation tiles and MODIS LST are missing (gap-fill documented in `/api/sources`).
4. **Novelty** is distance to a **16-site** catalog—not a claim of “never studied anywhere.”
5. **Physics ceiling:** open-Earth sites cannot replicate lunar PSR vacuum or exact regolith chemistry; scores mean **best terrestrial proxy** for listed stresses.
6. **Rock type is the dominant class of a 55 km cell** (GLiM): it marks basaltic country, not individual caves.
7. **No ice-cover layer:** cold targets (Haworth, Utopia) can still match glacier ice; telling ice sheets from ice-cemented permafrost needs one.

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

| Member | Role |
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

Source code: [Apache-2.0](LICENSE). Third-party: Three.js (MIT), Natural Earth (public domain). Imagery and elevation retain upstream terms—see **Data sources** in the app and `/api/sources`.
