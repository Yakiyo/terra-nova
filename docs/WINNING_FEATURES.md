# Winning features: lava tubes and permafrost, hardware readiness, EVA traverses

This document defines the three features TerraNova adds from the project review
(`TerraNova_Project_Review_and_Winning_Strategy.pdf`, sections 5 and 6): Features 1, 3
and 5. For each one it covers what it is, the science behind it, how it is built, how
we know it works, and how it scores against the NASA Space Apps rubric. Read it before
touching the code, and keep the status table current.

| # | Feature | Review gap | Status |
|---|---|---|---|
| 1 | Lava-tube skylight and cryo-permafrost archetypes | Gap 1: missing high-priority archetypes | Done (see Results) |
| 3 | Hardware test readiness matrix | Gap 3: "what can NASA actually test here?" | Done (see Results) |
| 5 | EVA traverse analyzer and mission dossier | Gap 5: no expedition workflow | Done (see Results) |

## Integration rules (apply to all three)

1. **Science lives in `src/compute`.** The browser draws what the API returns. It never
   computes a slope, a statistic or a score (`AGENTS.md`).
2. **Every number has a source.** Each value carries a `dataset_id` and a `source_url`.
   A number we could not verify is either left out or marked low confidence with the
   reason, never guessed.
3. **Old results do not move by accident.** The five existing targets keep their scores
   and validation; the tests prove it.
4. **Offline first.** Everything works with `OFFLINE=1` from committed or cached files.
5. **One design system.** UI follows `DESIGN.md` (Frontier tokens, icons from
   `web/icons.svg`, status shown with words and icons, never colour alone, reduced
   motion respected).
6. **Honest wording.** TerraNova screens environments. It does not certify hardware,
   and it does not speak for NASA.

---

## Feature 1: lava-tube skylight and cryo-permafrost archetypes

### What it is
Two new targets, beside the five surface sites:

- **Lunar lava-tube habitat, Marius Hills skylight** (`lunar_lava_tube`). A collapse
  pit opening into a lava tube: a natural shelter from radiation, micrometeoroids and the
  surface temperature extremes.
- **Mars cryo-permafrost ISRU, Utopia Planitia** (`utopia_permafrost`). Ice-rich
  ground in the northern mid-latitudes, where water could be mined (In-Situ Resource
  Utilization).

Both are central to current exploration planning: shelter underground on the Moon, and
water from ground ice on Mars. The existing five targets cover neither.

### The science, with sources

| Fact | Value | Source |
|---|---|---|
| Marius Hills Pit location | 14.0917° N, 303.2299° E (56.77° W); 40 m deep; "Mare" terrain | LROC Lunar Pit Atlas, pit 1: https://lroc.im-ldi.com/atlases/pits/1 |
| Lunar lava tubes form in basaltic lava flows | "formed during the eruption of basaltic lava flows" | https://en.wikipedia.org/wiki/Lunar_lava_tube |
| Deep lunar lava tubes are thermally stable | "a stable temperature of 17 °C (63 °F)" | https://en.wikipedia.org/wiki/Lunar_lava_tube |
| Utopia Planitia location | centred 46.7° N, 117.5° E; pingo-like ice features ~35-50° N, 80-115° E | https://en.wikipedia.org/wiki/Utopia_Planitia |
| Buried ice in Utopia Planitia | SHARAD radar (Mars Reconnaissance Orbiter) found ice-rich deposits; NASA (22 Nov 2016) estimated as much water as Lake Superior | https://en.wikipedia.org/wiki/Utopia_Planitia and https://www.jpl.nasa.gov/news/mars-ice-deposit-holds-as-much-water-as-lake-superior/ |
| Mars average temperature | about 214 K (−59 °C) | NASA NSSDC Mars fact sheet: https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html |
| Mars daily temperature swing | 184 K to 242 K (−89 to −31 °C), a 58 K swing (Viking 1 lander site) | same fact sheet |
| Continuous permafrost | forms where the mean annual surface temperature is below −5 °C | https://en.wikipedia.org/wiki/Permafrost |

### The new Earth data layer: basaltic volcanic rock
No existing layer can tell a lava field from any other dry, rugged place, so we add one.

- **Dataset:** Hartmann, J. and Moosdorf, N. (2012), *Global Lithological Map Database
  v1.0 (gridded to 0.5° spatial resolution)*, PANGAEA,
  https://doi.org/10.1594/PANGAEA.788537, licence CC-BY 3.0. The file
  `glim_wgs84_0point5deg.txt.asc` is a 720 × 360 grid on exactly our cells (from −180°,
  −90°, 0.5° steps). It gives the **dominant rock class** of each cell. Class 2, "vb", is
  basic volcanic rock (basalt), and class 10, "vi", is intermediate volcanic rock.
- **Criterion `basaltic_volcanic`** (0 to 1): 1 where the cell is dominated by basic
  volcanic rock, 0.5 where it is intermediate volcanic rock, otherwise 0. Lava tubes form
  mainly in fluid basaltic lava, so andesitic ground counts half. This is the dominant
  class of a 55 km cell, not a cave map: a basalt cell can hold many lava tubes, or none
  we know of.
- **Built by** `python -m src.acquire.glim`. It reads the PANGAEA zip from
  `cache/raw/glim/` and appends the layer to `cache/predictors.zarr` without touching the
  other eight layers.
- **Default weight 0**, like elevation. Only the lava-tube target switches it on, so no
  existing score changes.

### Target values
**Lunar lava-tube habitat** (14.09° N, −56.77°):
- **Basaltic volcanic rock** = 1.0, weight 2 (the defining condition). Source: lunar lava
  tubes form in basaltic lava; the Marius Hills Pit lies on mare terrain.
- **Mean temperature** = 17 °C, weight 1. This is the stable temperature inside deep
  lunar lava tubes. On Earth, it selects lava fields in a mild climate.
- **Annual temperature range** = 0 K, low confidence: the tube is described as stable.
  It is matched to Earth's smallest annual range.
- **Precipitation** = 0 and **vegetation** = 0: the Moon has no atmosphere and no
  biosphere.
- **Not used:**
  - Day-night swing: the habitat is inside the tube, so the surface swing does not
    describe it.
  - Slope, roughness and elevation: there is no terrain measurement at a matched scale.

**Mars cryo-permafrost** (46.7° N, 117.5° E):
- **Mean temperature**, weight 2: Earth's 20th percentile (about −24 °C), with the
  measured value −59 °C.
  - Mars is colder than any ice-free ground on Earth. Clamping to Earth's coldest land
    would select the East Antarctic plateau.
  - The 20th percentile sits well inside the continuous-permafrost regime (below −5 °C).
    This is an estimated class, shown as such.
  - The model has no ice-cover layer, so coastal Antarctic ice can still match. Telling
    glacier ice from ice-cemented ground needs that layer.
- **Day-night swing** = 58 K (NSSDC fact sheet, Viking 1 lander site). It is beyond
  anything on Earth, so it is matched to Earth's largest swing.
- **Precipitation** = 0 and **vegetation** = 0: no liquid-water rain and no known
  biosphere.
- **Slope and roughness**: low Earth percentiles, low confidence. Utopia Planitia is a
  plain.
- **Not used:** annual temperature range (no verified mid-latitude value) and elevation.

### Validation (catalogued analogs, ROC-AUC)
Each target is tested against known analog sites (positives) and the eight vegetated
reference points (negatives). All site pages are on Wikipedia, as the catalog requires.

- **`lava_tube` positives**, all famous lava-tube sites, chosen before scoring. Each
  must fall in a scored cell:
  - Craters of the Moon, Idaho (already catalogued; tag added)
  - Lava Beds National Monument, California (41.714° N, 121.508° W)
  - Lava River Cave, Oregon (43.895° N, 121.369° W)
  - Víðgelmir, Iceland (64.750° N, 20.802° W)
  - Undara Volcanic National Park, Australia (18.201° S, 144.596° E)

  Kazumura Cave (Hawaii), Cueva de los Verdes (Lanzarote) and Raufarhólshellir (Iceland)
  are famous too. They are left out because their 0.5° cells are mostly sea and are not
  scored.
- **`permafrost` positives:** Haughton impact crater on Devon Island, Axel Heiberg
  Island, and the McMurdo Dry Valleys. All three are ice-cemented permafrost and are
  already catalogued.
- **Acceptance:**
  - at least 3 scored positives and AUC ≥ 0.9 for both new targets;
  - the five existing targets keep identical AUCs.
  - **Honest limit:** separating basalt from rainforest is an easy test. The real value
    of the lava-tube target is how it ranks sites inside volcanic provinces.

### How it wins
- **Impact (20):** it addresses the two habitat strategies agencies care about most:
  shelter in lava tubes, and water from ground ice.
- **Creativity (20):** the habitat is matched by its interior climate (17 °C, stable), not
  its surface, and lithology is a new physical dimension in analog screening.
- **Validity (20):**
  - a peer-reviewed, openly licensed lithology layer;
  - five independent lava-tube sites and three permafrost sites as positives;
  - no change to existing results.
- **Relevance and NASA data (20 and 5):** LRO (LROC pit atlas), MRO SHARAD and NSSDC
  values, together with the partner dataset GLiM.

### Results (`python -m scripts.check_controls`, OFFLINE=1)

| Target | ROC-AUC | Positives and their percentile among Earth's land |
|---|---|---|
| Marius Hills lava-tube skylight | 1.00 | Craters of the Moon 99.4, Lava River Cave 99.0, Undara 99.0, Víðgelmir 98.6, Lava Beds 98.4 |
| Utopia Planitia ice-rich ground | 1.00 | Haughton (Devon Island) 74.8, McMurdo Dry Valleys 53.9, Axel Heiberg 49.8 |

- **Existing targets:** the five keep AUC 1.00 and identical top-5 results. The stack arrays they
  use are byte-identical.
- **Untagged lunar targets:** the south pole and Malapert now also count the four new lava-tube
  sites as lunar analogs (3 → 7 positives) and stay at AUC 1.00.
- **Top-ranked new candidates:**
  - **Lava tube:** dry, mild basalt provinces: Baja California's volcanic fields, Tibesti, the
    Altiplano and the Red Sea coast.
  - **Utopia:** the high, cold, barren northern Tibetan Plateau (continuous permafrost). Coastal
    Antarctic ice also ranks, the disclosed limit above.
- **Label fix found on the way:** the gazetteer's Taklamakan circle reached onto the Tibetan
  Plateau. It is now two smaller circles over the actual basin. Labels only; no score changes.

**Demo beat (about 20 s):** "Artemis will need shelter. Lunar lava tubes stay near
17 °C. TerraNova adds a rock-type layer and finds Earth's basaltic lava-tube country:
Idaho, Oregon, Iceland, Queensland. The famous lava caves rank in its top tier, which
validates the target, and new candidates appear beside them."

---

## Feature 3: hardware test readiness matrix

### What it is
For any site, a matrix answering "which mission systems could be field-tested here?".
It has four test categories, and each category has three requirements. Each requirement
shows the site's measured value, the threshold, a pass, near or fail mark, and its source.
Each category ends in one verdict:
- **Ready for TRL 5-6 field testing:** all requirements pass.
- **Partial**
- **Not suited**

NASA's TRL scale: at TRL 5, "simulations should be run in environments that are as close
to realistic as possible"; TRL 6 "has a fully functional prototype or representational
model". Source:
https://www.nasa.gov/directorates/somd/space-communications-navigation-program/technology-readiness-levels/

### The four categories
The thresholds are TerraNova screening thresholds. Each comes with its reason and
source. They are not NASA certification criteria.

1. **Ice-mining drill** (VIPER-class 1 m regolith drill, https://science.nasa.gov/mission/viper/):
   - Mean temperature ≤ −5 °C: continuous permafrost (Wikipedia, Permafrost).
   - Vegetation (NDVI) ≤ 0.1: barren ground ("values close to zero generally correspond
     to barren areas of rock, sand, or snow", Wikipedia, NDVI).
   - Precipitation ≤ 250 mm/yr: a desert (Wikipedia, Desert).
2. **Autonomous navigation under a low sun** (the lunar south pole sun never rises high):
   - |latitude| ≥ 66.57°, the polar circle (Wikipedia, Arctic Circle: 66° 34′). Inside
     it the Sun stays low for long periods.
   - Share of the year's daylight with the Sun below 10° ≥ 30%. Computed from solar
     geometry in `src/compute/qualification.py`, not taken from a dataset. The equator has
     12%; Earth's highest value is about 37%, near 70-75° latitude. (An earlier draft said
     40%, which no place on Earth reaches.)
   - Terrain roughness ≥ Earth's 75th percentile: enough relief to cast long shadows.
3. **Spacesuit EVA mobility** (NASA EVA and Human Surface Mobility Program,
   https://www.nasa.gov/suitup/; Axiom AxEMU suit for Artemis):
   - Basaltic volcanic rock ≥ 0.5 (Feature 1): rough lava ground underfoot.
   - Terrain roughness ≥ Earth's 60th percentile.
   - Day-night surface swing ≥ 15 K: thermal cycling of suit materials.
   - Vegetation ≤ 0.2: open ground.
4. **Rover mobility and hazard avoidance:**
   - Share of ground under 15° slope ≥ 80%. 15° is the rover limit used throughout
     TerraNova (`terrain.TRAFFICABLE_DEG`).
     - **Inputs:** this comes from the God's Eye site terrain (zoom-10 tiles, ~150 m × cos latitude per pixel) when it has it, and from
       regional slope otherwise. The matrix says which one it used.
   - Vegetation ≤ 0.2.
   - Precipitation ≤ 250 mm/yr.

**Near:** within 10% of the variable's Earth range of the threshold.

### How it is built
- **`src/compute/qualification.py`:**
  - the categories table: metric, comparison, threshold, reason and source for each
    requirement;
  - `assess(values, lat, terrain=None)`;
  - the solar geometry used for the low-sun requirement.
- **`GET /api/qualification?lat=&lon=&terrain=1`:** returns the matrix, with every value
  cited.
- **UI:** a "Hardware test readiness" section in the Finder site card, and the same
  matrix in God's Eye (using the site terrain).
- **Exports:** the GeoJSON and CSV gain readiness columns.

### Acceptance
- A cold, barren, dry test cell passes the drill category; a rainforest cell is not
  suited for any category.
- The low-sun share is 12% at the equator, rises to about 37% near 70°, and is lower again at 80°.
- Every requirement carries a source.
- The matrix renders for the #1 site.

### How it wins
- **Impact and Validity:** it turns a score into an engineering answer, "test the drill
  here, not the rover", with every threshold visible.
- **Creativity (20):** analog sites become hardware test venues, linked to NASA's TRL
  ladder.
- **Presentation:** one glanceable matrix in the demo.

**Demo beat:** "A 0.81 means little to an engineer. TerraNova says: the McMurdo Dry
Valleys are ready for ice-drill tests, partial for rovers, and here is the exact
threshold each number passed."

### Results (`GET /api/qualification?terrain=1`, OFFLINE=1)

| Place (cell) | Ice drill | Low-sun navigation | Spacesuit EVA | Rover | Rover terrain basis |
|---|---|---|---|---|---|
| McMurdo Dry Valleys (−77.47, 162.52) | Ready | Ready | Partial | Partial | regional slope (no cached site terrain) |
| Devon Island / Haughton (75.4, −89.8) | Partial | Partial | Partial | Partial | regional slope |
| Craters of the Moon cell (43.42, −113.52) | Not suited | Not suited | Partial | Not suited | regional slope |
| Amazon Basin (−3.0, −60.0) | Not suited | Not suited | Not suited | Not suited | regional slope |
| #1 for Haworth, East Antarctic Ice Sheet (−81.75, 73.25) | Ready | Partial | Not suited | Ready | share under 15° on 22 m terrain |

- The 22 m figure is the zoom-10 tile pixel at 81.75° S (about 150 m × cos latitude).
- **Checks:** `tests/test_qualification.py` (7 tests). `scripts/ui_smoke.mjs` checks that the
  site card shows 4 categories with linked thresholds, and that God's Eye uses the site
  terrain for the rover.
- **Honest limit:** the verdicts are screening, not certification. A "Ready" ice sheet
  cell is ready for a drill *test* on ice, which is not the same as ice-cemented regolith.
  The criterion table beside it shows that difference.

---

## Feature 5: EVA traverse analyzer and mission dossier

### What it is
In God's Eye, a crew plans a traverse:
1. Click to place waypoints: Basecamp, then Science Station, then Drill Site, up to eight.
2. See the elevation profile of the whole route, with every stretch steeper than 15°
   marked red as a rover rollover hazard.
3. Drive a rover along the route.
4. Export a **mission dossier**: one printable page with the maps, the route statistics,
   the readiness matrix and full data citations, plus the route as GeoJSON.

### How it is built
- **`src/compute/traverse.py`** and **`POST /api/traverse`**. The route is measured on
  the server, on the full-resolution elevation tiles: AWS Terrain Tiles at zoom 10
  (about 150 m × cos latitude per pixel, so 116-123 m at 36-41° N), the same mosaic God's
  Eye shows. The display grid averages 4 × 4 of these pixels, so the route is measured 4×
  finer, and the profile maths moves out of the browser, as `AGENTS.md` requires. It
  returns:
  - samples along each leg about once per elevation pixel (distance, latitude, longitude,
    elevation, terrain slope and grade);
  - per-leg and total distance, climb, descent, steepest grade and steepest ground, plus
    the share of length over 15°;
  - the hazard stretches;
  - a walking-time estimate from Tobler's hiking function,
    W = 6 · exp(−3.5 · |tan θ + 0.05|) km/h (Tobler 1993,
    https://en.wikipedia.org/wiki/Tobler%27s_hiking_function), labelled as an Earth
    walking estimate.
  - **Definitions:**
    - *Terrain slope* is the steepest slope of the ground at a point, in any direction
      (the same central differences as God's Eye's statistics).
    - *Grade* is the slope along the direction of travel. It uses the same two-step
      stencil and is capped at the terrain slope, because no direction can be steeper
      than the steepest one. Without the cap, one-pixel differences on the interpolated
      surface read up to ~1.3° too steep: 17.5° against a 16.2° maximum slope on the test
      route below.
    - *Hazard:* a step whose mean terrain slope is ≥ 15°.
    - *Climb, descent and walking time:* the raw rise of every step.
- **The God's Eye "Plan a traverse" tool** replaces "Measure a profile":
  - numbered waypoint markers, a list to rename, remove and clear waypoints, Backspace to
    undo, and Esc to leave the tool (the route stays);
  - "Add the site pin" places a waypoint without a mouse;
  - the route drawn on the terrain in tool blue, red where steeper than 15°;
  - a profile chart with red hazard bands and waypoint ticks;
  - **Drive it**;
  - **Route GeoJSON**, which saves `TerraNova_route_<site>.geojson`: a LineString with
    the totals, legs and hazards, and one Point per waypoint.
- **Mission dossier:** "Export mission dossier" saves `TerraNova_dossier_<site>.html`.
  It is self-contained (inline CSS, pictures as data URLs), works offline and prints to
  A4 PDF. The route GeoJSON is also embedded in it as a download link. Its own button
  exists because browsers block a second automatic download from one click. The dossier
  contains:
  - the site summary;
  - a 3D view and a top-down route map, north up, with the route drawn at print weight;
  - the route tables and profile;
  - terrain statistics;
  - the readiness matrix;
  - the criterion table;
  - method and caveats;
  - every citation, including the Sentinel-2 CC BY-NC-SA notice.

  It is titled as an analog field-test dossier for an Artemis-class (Moon) or Mars
  mission. It carries no NASA logos and implies no endorsement.

### Acceptance
- On a synthetic tilted plane, the computed grade and slope match the exact values.
- A synthetic ridge produces exactly one hazard stretch.
- On rough random terrain, the grade never exceeds the terrain slope.
- In the browser: three clicks make three waypoints and a profile, and the export
  produces both files, with "Citations" and the site name in the HTML.

### How it wins
- **Storytelling and UX (5):** the judge plans an EVA, sees the hazards and leaves with a
  dossier. TerraNova goes from recommending sites to rehearsing missions.
- **Validity:** route numbers come from the site terrain on the server, and every one is
  cited.
- **Presentation:** the dossier is a ready-made artefact to show on camera and to share.

**Demo beat:** "Basecamp, science station, drill site. The second leg crosses a slope
steeper than 15°, shown in red; reroute around it. One click and the field team has its
dossier, with every number cited."

### Results (OFFLINE=1, cached terrain)

| Route (3 waypoints) | Distance | Climb / descent | Walk (Tobler) | Steepest grade / ground | Over 15° |
|---|---|---|---|---|---|
| Kumtag Desert, #1 for Lunar South Pole (40.75° N, 91.75° E) | 64.4 km | +915 / −863 m | 13 h 05 min | 10.9° / 13.0° | 0%, no hazards |
| Tibetan Plateau, Gale crater result (36.25° N, 84.25° E) | 66.8 km | +1,482 / −1,799 m | 14 h 15 min | 16.2° / 16.2° | 0.2%: one 123 m stretch on leg 2 |

- Samples are spaced 116 m (Kumtag) and 123 m (Tibet), one per elevation pixel.
- **Checks:**
  - `tests/test_traverse.py`: 9 tests (analytic plane, Tobler, ridge, multi-leg order,
    grade ≤ slope, coincident waypoints, out-of-block and count limits, dateline, the
    endpoint on a cached block).
  - `scripts/ui_smoke.mjs`: 5 browser checks (3 clicks → 3 waypoints and a profile,
    hazard legend and source, Backspace undo, both exports with citations and pictures,
    Esc keeps the route).
- **Printed check:** Chrome's print engine renders the Tibetan Plateau dossier as an A4 PDF,
  6-7 pages: summary and pictures; traverse; terrain; readiness; criteria; method;
  citations. Tables, pictures and readiness blocks never split across pages.
- **Honest limits:**
  - legs are straight lines; there is no automatic rerouting;
  - Tobler's function describes an unencumbered walker on Earth, not a suited astronaut
    in lunar or Martian gravity;
  - the 15° limit is a rover screening value, not a vehicle specification.
