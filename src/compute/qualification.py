"""Hardware test readiness: which mission systems could be field-tested at a site.

Four test categories, each with three or four environmental requirements. Every
requirement compares one measured value of the site (from the predictor stack, the
latitude, or the God's Eye terrain model) with a threshold, and reports:

* ``pass``: the requirement is met;
* ``near``: missed by no more than 10% of that variable's Earth range;
* ``fail``: missed by more;
* ``no_data``: the site has no value for it.

A category is **ready** for TRL 5-6 field testing when every requirement passes,
**partial** when at least half pass or are near, and **not suited** otherwise. NASA's
TRL scale asks TRL 5 work to be tested "in environments that are as close to realistic
as possible" and TRL 6 to use "a fully functional prototype or representational model".

The thresholds are TerraNova screening thresholds, each stated with its reason and a
source. They are not NASA certification criteria, and passing them does not certify
any hardware. The low-sun share is computed here from solar geometry: for the site's
latitude, every day of the year and every 4 minutes of the day, the solar elevation is
``asin(sin(lat) sin(decl) + cos(lat) cos(decl) cos(hour angle))``, with the solar
declination ``-23.44 cos(2 pi (day + 10) / 365)`` degrees. The share is the fraction of
daylight samples with the Sun between 0 and 10 degrees.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from functools import lru_cache

import numpy as np

TRL_SOURCE_URL = "https://www.nasa.gov/directorates/somd/space-communications-navigation-program/technology-readiness-levels/"
NEAR_FRACTION = 0.10      # "near": within 10% of the variable's Earth range
LOW_SUN_DEG = 10.0
OBLIQUITY_DEG = 23.44
POLAR_CIRCLE_DEG = 66.57  # 66 deg 34 min

VERDICT_LABELS = {
    "ready": "Ready for TRL 5-6 field tests",
    "partial": "Partial",
    "not_suited": "Not suited",
}


@dataclass(frozen=True)
class Requirement:
    metric: str           # a predictor key, or one of DERIVED_METRICS
    comparison: str       # "<=" or ">="
    threshold: float | None = None
    earth_percentile: int | None = None   # threshold taken from Earth's distribution instead
    why: str = ""
    source_url: str = ""


@dataclass(frozen=True)
class Category:
    id: str
    name: str
    system: str
    system_url: str
    requirements: tuple[Requirement, ...]


PERMAFROST = "https://en.wikipedia.org/wiki/Permafrost"
NDVI = "https://en.wikipedia.org/wiki/Normalized_difference_vegetation_index"
DESERT = "https://en.wikipedia.org/wiki/Desert"
POLAR_CIRCLE = "https://en.wikipedia.org/wiki/Arctic_Circle"
SOLAR = "https://en.wikipedia.org/wiki/Solar_zenith_angle"
GLIM = "https://doi.org/10.1594/PANGAEA.788537"
TERRAIN = "https://registry.opendata.aws/terrain-tiles/"

CATEGORIES: tuple[Category, ...] = (
    Category(
        "ice_drill", "Ice-mining drill", "VIPER-class 1 m regolith drill",
        "https://science.nasa.gov/mission/viper/",
        (
            Requirement("mean_annual_temperature", "<=", -5.0,
                        why="Continuous permafrost: mean annual surface temperature below -5 °C, so the ground stays ice-cemented.",
                        source_url=PERMAFROST),
            Requirement("vegetation", "<=", 0.1,
                        why="Barren ground: NDVI near zero means bare rock, sand or snow, like regolith.",
                        source_url=NDVI),
            Requirement("precipitation", "<=", 250.0,
                        why="Desert dryness: under 250 mm a year.",
                        source_url=DESERT),
        ),
    ),
    Category(
        "low_sun_navigation", "Navigation under a low sun", "Autonomous navigation and hazard detection at grazing sun angles",
        SOLAR,
        (
            Requirement("abs_latitude", ">=", POLAR_CIRCLE_DEG,
                        why="Inside the polar circle (66° 34') the Sun stays low for long periods, as at the lunar south pole.",
                        source_url=POLAR_CIRCLE),
            Requirement("low_sun_share", ">=", 0.30,
                        why="At least 30% of the year's daylight with the Sun below 10° (the equator has 12%; Earth's maximum, near 70-75°, is about 37%): long shadows and harsh contrast.",
                        source_url=SOLAR),
            Requirement("roughness", ">=", earth_percentile=75,
                        why="Rough enough (Earth's top quarter) to cast the long shadows that challenge vision systems.",
                        source_url=TERRAIN),
        ),
    ),
    Category(
        "eva_suit", "Spacesuit EVA mobility", "Artemis EVA suits (NASA EVA and Human Surface Mobility Program)",
        "https://www.nasa.gov/suitup/",
        (
            Requirement("basaltic_volcanic", ">=", 0.5,
                        why="Volcanic ground underfoot: basaltic or intermediate lava, like the lunar maria.",
                        source_url=GLIM),
            Requirement("roughness", ">=", earth_percentile=60,
                        why="Uneven, rugged ground (Earth's top 40%) for walking and balance tests.",
                        source_url=TERRAIN),
            Requirement("lst_diurnal_range", ">=", 15.0,
                        why="A day-night surface swing of 15 K or more cycles suit materials and thermal control.",
                        source_url="https://doi.org/10.5281/zenodo.6458406"),
            Requirement("vegetation", "<=", 0.2,
                        why="Open ground: NDVI up to about 0.2 is shrub and grassland at most.",
                        source_url=NDVI),
        ),
    ),
    Category(
        "rover", "Rover mobility and hazard avoidance", "Lunar Terrain Vehicle and pressurized rovers",
        "https://www.nasa.gov/suitup/",
        (
            Requirement("share_under_15", ">=", 0.80,
                        why="At least 80% of the ground under 15°, TerraNova's rover rollover limit, so long traverses are possible.",
                        source_url=TERRAIN),
            Requirement("vegetation", "<=", 0.2,
                        why="Open ground the rover can cross without vegetation hiding obstacles.",
                        source_url=NDVI),
            Requirement("precipitation", "<=", 250.0,
                        why="Desert dryness: firm, dry ground year-round.",
                        source_url=DESERT),
        ),
    ),
)

DERIVED_METRICS = {
    "abs_latitude": {"label": "Distance from the equator", "unit": "°", "span": 90.0,
                     "dataset_id": "grid_cell_centre", "source_url": POLAR_CIRCLE},
    "low_sun_share": {"label": "Daylight with the Sun below 10°", "unit": "share", "span": 1.0,
                      "dataset_id": "solar_geometry_computed", "source_url": SOLAR},
    "share_under_15": {"label": "Ground under 15° slope", "unit": "share", "span": 1.0,
                       "dataset_id": "aws_terrain_tiles_terrarium", "source_url": TERRAIN},
}


@lru_cache(maxsize=512)
def low_sun_share(lat: float) -> float:
    """Share of a year's daylight with the Sun between 0 and 10 degrees (see module docstring)."""
    phi = math.radians(lat)
    days = np.arange(365.0)
    decl = np.radians(-OBLIQUITY_DEG * np.cos(2 * np.pi * (days + 10) / 365))[:, None]
    hours = np.radians((np.arange(360) * 4 / 60 - 12) * 15)[None, :]   # every 4 minutes
    sin_el = np.sin(phi) * np.sin(decl) + np.cos(phi) * np.cos(decl) * np.cos(hours)
    elevation = np.degrees(np.arcsin(np.clip(sin_el, -1, 1)))
    daylight = elevation > 0
    if not daylight.any():
        return 0.0
    return float(((elevation > 0) & (elevation < LOW_SUN_DEG)).sum() / daylight.sum())


def _threshold(req: Requirement, ranges: Mapping[str, object]) -> float:
    if req.earth_percentile is None:
        return float(req.threshold)
    return float(ranges[req.metric].value_at_percentile(req.earth_percentile))


def _span(metric: str, ranges: Mapping[str, object]) -> float:
    if metric in DERIVED_METRICS:
        return DERIVED_METRICS[metric]["span"]
    r = ranges[metric]
    return float(r.earth_max - r.earth_min)


def _status(value: float | None, comparison: str, threshold: float, span: float) -> str:
    if value is None or not math.isfinite(value):
        return "no_data"
    gap = threshold - value if comparison == ">=" else value - threshold
    if gap <= 0:
        return "pass"
    return "near" if gap <= NEAR_FRACTION * span else "fail"


def _verdict(statuses: list[str]) -> str:
    if all(s == "pass" for s in statuses):
        return "ready"
    good = sum(1.0 if s == "pass" else 0.5 if s == "near" else 0.0 for s in statuses)
    return "partial" if good >= len(statuses) / 2 else "not_suited"


def assess(
    values: Mapping[str, float | None],
    lat: float,
    ranges: Mapping[str, object],
    sources: Mapping[str, Mapping[str, str]],
    *,
    share_under_15: float | None = None,
) -> list[dict[str, object]]:
    """The readiness matrix for one site.

    ``values``: predictor values of the site's cell. ``ranges``: ``CriterionRange``
    objects (labels, units, Earth envelope and quantiles). ``sources``: dataset id and
    URL per predictor. ``share_under_15``: from the site terrain model (God's Eye DEM) when known; when
    it is ``None`` the rover requirement falls back to the cell's regional slope, held
    to Earth's 75th percentile, and says so.
    """
    derived = {"abs_latitude": abs(lat), "low_sun_share": low_sun_share(round(lat, 2)),
               "share_under_15": share_under_15}
    out = []
    for cat in CATEGORIES:
        rows = []
        for req in cat.requirements:
            if req.metric == "share_under_15" and share_under_15 is None:
                req = Requirement("slope", "<=", earth_percentile=75,
                                  why="Gentle regional slope (no steeper than Earth's 75th percentile). "
                                      "Open the site in God's Eye for the site-terrain share of ground under 15°.",
                                  source_url=TERRAIN)
            threshold = _threshold(req, ranges)
            if req.metric in DERIVED_METRICS:
                meta = DERIVED_METRICS[req.metric]
                value = derived[req.metric]
                label, unit = meta["label"], meta["unit"]
                dataset_id, value_url = meta["dataset_id"], meta["source_url"]
            else:
                raw = values.get(req.metric)
                value = None if raw is None else float(raw)
                label, unit = ranges[req.metric].label, ranges[req.metric].unit
                dataset_id = sources[req.metric]["dataset_id"]
                value_url = sources[req.metric]["source_url"]
            status = _status(value, req.comparison, threshold, _span(req.metric, ranges))
            rows.append({
                "metric": req.metric,
                "label": label,
                "unit": unit,
                "value": None if value is None or not math.isfinite(value) else round(value, 4),
                "comparison": req.comparison,
                "threshold": round(threshold, 4),
                "threshold_basis": f"Earth's {req.earth_percentile}th percentile" if req.earth_percentile is not None else "fixed",
                "status": status,
                "why": req.why,
                "threshold_source_url": req.source_url,
                "dataset_id": dataset_id,
                "source_url": value_url,
            })
        verdict = _verdict([r["status"] for r in rows])
        out.append({
            "id": cat.id,
            "name": cat.name,
            "system": cat.system,
            "system_url": cat.system_url,
            "verdict": verdict,
            "verdict_label": VERDICT_LABELS[verdict],
            "requirements": rows,
        })
    return out
