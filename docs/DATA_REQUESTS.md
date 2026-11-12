# What we need next (datasets, accounts, decisions)

Everything the app uses today was downloadable without an account. The items below
unlock the next level. Put downloaded files in `cache/raw/<folder>/` exactly as
named, and tell the team or the owning division which ones arrived.

## A. Accounts (each member, this week)

| Account | Why | Link |
|---|---|---|
| NASA Earthdata Login | MODIS products straight from LP DAAC (MOD13C2 NDVI, MOD11A2 LST), NASADEM, ASTER | https://urs.earthdata.nasa.gov |
| OpenTopography API key | 30 m Copernicus GLO-30 tiles for the Stage-2 zoom-in on top candidates | https://portal.opentopography.org |
| Google Earth Engine (optional) | Faster global Landsat/Sentinel-2 band ratios for the mineral criterion | https://earthengine.google.com |

Put credentials in `.env` (see `.env.example`). Never commit them.

## B. Lunar target data (Division 2): biggest win

**Source:** NASA PGDA Product 78, https://pgda.gsfc.nasa.gov/products/78
**Save to:** `cache/raw/pgda78/`

| Site | Files (exact names) | Unlocks |
|---|---|---|
| Site01 | `Site01_final_adj_5mpp_surf.tif`, `Site01_final_adj_5mpp_slp.tif`, `Site01_final_adj_5mpp_slperr.tif` | "Sunlit ridge" archetype |
| Site04 | same three files with `Site04_` | "Crater rim" archetype |
| Site23 | same three files with `Site23_` | second ridge / massif |
| Haworth | same three files with `Haworth_` | "Cold trap (PSR)" archetype |
| Shoemaker | same three files with `Shoemaker_` | "Cold trap (PSR)" archetype |

Do **not** download the 100 `_err` clone files or the `.xyzi` point clouds.

With these, the slope and roughness targets can be *measured* (slope histograms at
matched scale) instead of being set as Earth-percentile terrain classes. Also needed:
the Barker et al. paper linked from the PGDA 78 page, to confirm which site number is
Connecting Ridge / Malapert / Shackleton rim.

## C. Mars target data (Division 3)

| Need | Source | Note |
|---|---|---|
| HiRISE DTM for Jezero (crater floor / delta) | https://www.uahirise.org/dtm/ or PDS | Verify the ID; the one in the research notes is unverified |
| HiRISE DTM for Gale / Mount Sharp | same | For a "sulfate mound" archetype |
| MEDA or REMS temperature papers for Gale | Curiosity REMS literature | Annual and daily ground-temperature range |
| CRISM mineral summary for Jezero and Gale | PDS Geosciences / Mars ODE | For a future mineral criterion |

## D. New archetype targets (Divisions 2 and 3)

Each new target in `data/targets.json` needs, **for every criterion**, a value (or an
Earth percentile) plus `dataset_id`, `source_url`, `definition_note` and `confidence`.
The tests reject anything uncited.

Done: **Malapert Massif**, **Haworth cold trap**, **Gale Crater**, the **Marius Hills
lava-tube skylight** and **Utopia Planitia ice-rich ground** are in `data/targets.json`. Their terrain values are estimated classes (marked "estimated" in the
app) until PGDA Product 78 / HiRISE data arrive; Haworth's terrain is "not used".

Still wanted:

1. **Shoemaker cold trap**: Diviner PSR temperatures (Paige et al. 2010, Science).
2. **Measured temperatures for Gale**: REMS ground temperature (the current values are
   air temperature from the REMS climate table).
3. **Lava-tube skylight** (Marius Hills pit, 14.09°N 303.23°E): **done** as `lunar_lava_tube`, using a
   basaltic-rock layer from GLiM (see `docs/WINNING_FEATURES.md`). Still wanted: a cave layer on
   the Earth side as well.

## E. Earth data upgrades (Division 4)

| Upgrade | Data | Why |
|---|---|---|
| Stage-2 zoom-in | Copernicus GLO-30 via OpenTopography for the top ~200 cells | 30 m slope/roughness for real site comparison |
| Mineral criterion | Landsat 8/9 Collection 2 L2 (B6/B5, B6/B7, B4/B2 ratios) | Basalt vs. clay vs. iron-oxide |
| Permafrost | ESA CCI Permafrost (mean annual ground temperature) | Cold-trap archetype |
| Direct MODIS | MOD13C2 and MOD11A2 from LP DAAC (needs Earthdata Login) | Replace the GIBS decode and the Zenodo LST with NASA's own files |

## F. Decisions only the team can make

1. **Product name.** **TerraNova** (locked for Space Apps 2026).
2. **Which archetypes to show on day 1 of the hackathon.** Recommendation: the lunar
   south pole plus PSR cold trap for the Moon, and Jezero plus Gale for Mars.
3. **Whether to keep Wikipedia** as the citation for the known-analog catalog, or
   replace it with NASA/USGS pages (better for judging; Division 5).
