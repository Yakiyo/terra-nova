"""EVA traverse analysis: a route of 2-8 waypoints over one God's Eye elevation block.

Deterministic numpy only (Feature 5, docs/WINNING_FEATURES.md). The browser picks the
waypoints; every number about the route is computed here, on the full-resolution
elevation mosaic that ``/api/site3d`` uses (AWS Terrain Tiles, zoom 10: 1024 x 1024
pixels of about 150 m x cos(latitude)), not on the coarser display grid.

Method
------
* Each leg is a straight line in the Web Mercator pixel frame (locally a straight line
  on the ground), sampled about once per elevation pixel. Elevation and terrain slope at
  each sample are bilinear interpolations of the mosaic and of its per-pixel slope
  (``terrain.slope_degrees``, central differences, per-row pixel size).
* Step length = pixel distance x the ground size of a pixel at the step's latitude
  (``terrain.pixel_size_m``). Climb, descent and walking time use each step's rise.
* Grade (the slope along the direction of travel) uses centred differences over two
  steps, the same stencil as the terrain slope, signed (uphill > 0). No direction can be
  steeper than the steepest one, so its size is capped at the terrain slope there; this
  removes interpolation noise that would otherwise read a degree or so too steep.
* Terrain slope is the steepest slope of the ground at the sample, whatever the
  direction of travel, so it also catches side slopes. A step is a hazard when the mean
  terrain slope of its two ends is at least ``terrain.TRAFFICABLE_DEG`` (15 degrees, the
  rover limit used throughout TerraNova). Consecutive hazard steps form one interval.
* Walking time uses Tobler's hiking function (Tobler 1993):
  ``W = 6 exp(-3.5 |dh/dx + 0.05|)`` km/h. It is an Earth estimate for an unencumbered
  walker on foot, shown for comparison between routes, not as a suited EVA timeline.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from itertools import pairwise

import numpy as np

from src.compute import terrain

TOBLER_SOURCE_URL = "https://en.wikipedia.org/wiki/Tobler%27s_hiking_function"
MIN_WAYPOINTS = 2
MAX_WAYPOINTS = 8
TILE_PX = 256


class TraverseError(ValueError):
    """A route that cannot be analysed on this block (for example a waypoint outside it)."""


@dataclass(frozen=True)
class Block:
    """An elevation mosaic in the slippy-map frame: top-left tile (x0, y0) at zoom z."""

    dem: np.ndarray       # metres, (rows, cols)
    slope: np.ndarray     # degrees, same shape
    x0: int
    y0: int
    z: int

    @property
    def shape(self) -> tuple[int, int]:
        return self.dem.shape  # type: ignore[return-value]

    def to_pixel(self, lat: float, lon: float) -> tuple[float, float]:
        """Continuous pixel position (col, row) of a point; pixel i spans [i, i + 1)."""
        fx, fy = terrain.lonlat_to_tile(lat, lon, self.z)
        n = 2**self.z
        centre = self.x0 + self.shape[1] / TILE_PX / 2
        fx += round((centre - fx) / n) * n   # the copy of the point nearest the block (dateline)
        return (fx - self.x0) * TILE_PX, (fy - self.y0) * TILE_PX

    def contains(self, col: float, row: float) -> bool:
        rows, cols = self.shape
        return 0.0 <= col <= cols and 0.0 <= row <= rows

    def lat_at(self, row: float | np.ndarray) -> np.ndarray:
        y = self.y0 + np.asarray(row, dtype=float) / TILE_PX
        return np.degrees(np.arctan(np.sinh(np.pi * (1.0 - 2.0 * y / 2**self.z))))

    def lon_at(self, col: float | np.ndarray) -> np.ndarray:
        lon = (self.x0 + np.asarray(col, dtype=float) / TILE_PX) / 2**self.z * 360.0 - 180.0
        return (lon + 540.0) % 360.0 - 180.0


def block_from_mosaic(dem: np.ndarray, x0: int, y0: int, z: int) -> Block:
    """A Block with its per-pixel slope, computed as ``/api/site3d`` computes it."""
    rows = dem.shape[0]
    row_lat = np.array([terrain.tile_to_lat(y0 + (v + 0.5) / TILE_PX, z) for v in range(rows)])
    return Block(dem=dem, slope=terrain.slope_degrees(dem, row_lat, z), x0=x0, y0=y0, z=z)


def _bilinear(grid: np.ndarray, col: np.ndarray, row: np.ndarray) -> np.ndarray:
    """Values at continuous pixel positions (pixel centres at i + 0.5), edge-clamped."""
    rows, cols = grid.shape
    x = np.clip(col - 0.5, 0.0, cols - 1.0)
    y = np.clip(row - 0.5, 0.0, rows - 1.0)
    c0 = np.minimum(np.floor(x).astype(int), cols - 2) if cols > 1 else np.zeros_like(x, dtype=int)
    r0 = np.minimum(np.floor(y).astype(int), rows - 2) if rows > 1 else np.zeros_like(y, dtype=int)
    fx, fy = x - c0, y - r0
    c1, r1 = np.minimum(c0 + 1, cols - 1), np.minimum(r0 + 1, rows - 1)
    top = grid[r0, c0] * (1 - fx) + grid[r0, c1] * fx
    bottom = grid[r1, c0] * (1 - fx) + grid[r1, c1] * fx
    return top * (1 - fy) + bottom * fy


def tobler_kmh(rise_over_run: np.ndarray) -> np.ndarray:
    """Tobler's hiking function: walking speed (km/h) on a signed gradient dh/dx."""
    return 6.0 * np.exp(-3.5 * np.abs(rise_over_run + 0.05))


def _hazard_intervals(d_km: np.ndarray, hazard_step: np.ndarray, slope: np.ndarray,
                      leg_of_step: np.ndarray) -> list[dict]:
    """Runs of consecutive hazard steps as distance intervals along the route."""
    out: list[dict] = []
    k, n = 0, hazard_step.size
    while k < n:
        if not hazard_step[k]:
            k += 1
            continue
        start = k
        while k < n and hazard_step[k]:
            k += 1
        # Step j joins sample j and sample j + 1.
        seg = slope[start : k + 1]
        peak = start + int(np.argmax(seg))
        out.append({
            "start_km": round(float(d_km[start]), 3),
            "end_km": round(float(d_km[k]), 3),
            "length_m": round(float((d_km[k] - d_km[start]) * 1000.0), 1),
            "max_slope_deg": round(float(slope[peak]), 2),
            "at_km": round(float(d_km[peak]), 3),
            "leg": int(leg_of_step[start]),
        })
    return out


def _grade(d_m: np.ndarray, elev: np.ndarray, slope: np.ndarray) -> np.ndarray:
    """Signed grade (degrees) at every sample: centred differences, capped at the slope."""
    if elev.size < 2:
        return np.zeros_like(elev)
    # A zero-length step (two waypoints on one spot) has no rise; the micrometre tie-break
    # only keeps np.gradient's spacing positive.
    rise = np.gradient(elev, d_m + np.arange(elev.size) * 1e-6)
    grade = np.degrees(np.arctan(rise))
    return np.sign(grade) * np.minimum(np.abs(grade), slope)


def _summary(step_m: np.ndarray, dz: np.ndarray, grade: np.ndarray, slope: np.ndarray,
             hazard_step: np.ndarray, hours: np.ndarray) -> dict:
    distance = float(step_m.sum())
    return {
        "distance_km": round(distance / 1000.0, 3),
        "climb_m": round(float(dz[dz > 0].sum()), 1),
        "descent_m": round(float(-dz[dz < 0].sum()), 1),
        "max_grade_deg": round(float(np.abs(grade).max()) if grade.size else 0.0, 2),
        "max_terrain_slope_deg": round(float(slope.max()) if slope.size else 0.0, 2),
        "share_over_limit": round(float(step_m[hazard_step].sum() / distance) if distance > 0 else 0.0, 4),
        "walk_hours": round(float(hours.sum()), 3),
    }


def analyse(block: Block, waypoints: list[dict]) -> dict:
    """Profile, per-leg and total statistics, and hazard intervals for a waypoint route.

    ``waypoints``: 2-8 dicts with ``lat``, ``lon`` and an optional ``name``. Raises
    ``TraverseError`` when the count is wrong or a waypoint lies outside the block.
    """
    if not MIN_WAYPOINTS <= len(waypoints) <= MAX_WAYPOINTS:
        raise TraverseError(f"a traverse needs {MIN_WAYPOINTS}-{MAX_WAYPOINTS} waypoints")
    rows, cols = block.shape
    pix = []
    for i, w in enumerate(waypoints):
        col, row = block.to_pixel(float(w["lat"]), float(w["lon"]))
        if not block.contains(col, row):
            raise TraverseError(f"waypoint {i + 1} ({w.get('name') or 'unnamed'}) is outside the terrain block")
        pix.append((col, row))

    cols_s, rows_s, leg_s = [np.array([pix[0][0]])], [np.array([pix[0][1]])], [np.array([0])]
    for leg, ((c0, r0), (c1, r1)) in enumerate(pairwise(pix)):
        steps = max(1, math.ceil(math.hypot(c1 - c0, r1 - r0)))
        t = np.arange(1, steps + 1) / steps
        cols_s.append(c0 + (c1 - c0) * t)
        rows_s.append(r0 + (r1 - r0) * t)
        leg_s.append(np.full(steps, leg))
    col = np.concatenate(cols_s)
    row = np.concatenate(rows_s)
    leg_of_sample = np.concatenate(leg_s)

    elev = _bilinear(block.dem, col, row)
    slope = _bilinear(block.slope, col, row)
    lat = block.lat_at(row)
    mid_lat = block.lat_at((row[1:] + row[:-1]) / 2.0)
    step_m = np.hypot(np.diff(col), np.diff(row)) * terrain.pixel_size_m(block.z, mid_lat)
    dz = np.diff(elev)
    with np.errstate(divide="ignore", invalid="ignore"):
        rise = np.where(step_m > 0, dz / step_m, 0.0)
    hours = np.where(step_m > 0, step_m / 1000.0 / tobler_kmh(rise), 0.0)
    step_slope = (slope[1:] + slope[:-1]) / 2.0
    hazard_step = step_slope >= terrain.TRAFFICABLE_DEG
    leg_of_step = leg_of_sample[1:]
    d_km = np.concatenate([[0.0], np.cumsum(step_m)]) / 1000.0
    grade = _grade(d_km * 1000.0, elev, slope)

    # Sample index where each waypoint falls: 0, then the last sample of each leg.
    marks = [0] + [int(np.flatnonzero(leg_of_sample == leg)[-1]) for leg in range(len(pix) - 1)]
    out_waypoints = []
    for i, (w, k) in enumerate(zip(waypoints, marks, strict=True)):
        out_waypoints.append({
            "index": i,
            "name": str(w.get("name") or f"Waypoint {i + 1}")[:40],
            "lat": round(float(lat[k]), 5),
            "lon": round(float(block.lon_at(col[k])), 5),
            "u": round(float(col[k] / cols), 5),
            "v": round(float(row[k] / rows), 5),
            "d_km": round(float(d_km[k]), 3),
            "elev_m": round(float(elev[k]), 1),
            "terrain_slope_deg": round(float(slope[k]), 2),
        })

    legs = []
    for leg in range(len(pix) - 1):
        sel = leg_of_step == leg
        sample_sel = np.concatenate([[False], sel]) | np.concatenate([sel, [False]])
        legs.append({
            "index": leg,
            "from": out_waypoints[leg]["name"],
            "to": out_waypoints[leg + 1]["name"],
            **_summary(step_m[sel], dz[sel], grade[sample_sel], slope[sample_sel], hazard_step[sel], hours[sel]),
        })

    return {
        "waypoints": out_waypoints,
        "legs": legs,
        "total": _summary(step_m, dz, grade, slope, hazard_step, hours),
        "hazards": _hazard_intervals(d_km, hazard_step, slope, leg_of_step),
        "samples": {
            "d_km": np.round(d_km, 4).tolist(),
            "elev_m": np.round(elev, 1).tolist(),
            "terrain_slope_deg": np.round(slope, 2).tolist(),
            "grade_deg": np.round(grade, 2).tolist(),
            "lat": np.round(lat, 5).tolist(),
            "lon": np.round(block.lon_at(col), 5).tolist(),
            "u": np.round(col / cols, 5).tolist(),
            "v": np.round(row / rows, 5).tolist(),
        },
        "limit_deg": terrain.TRAFFICABLE_DEG,
        "sample_spacing_m": round(float(np.median(step_m)) if step_m.size else 0.0, 1),
        "method": (__doc__ or "").strip(),
        "walking_model": {
            "name": "Tobler's hiking function (Tobler 1993)",
            "formula": "W = 6 exp(-3.5 |dh/dx + 0.05|) km/h",
            "source_url": TOBLER_SOURCE_URL,
            "note": "Earth walking estimate on foot, for comparing routes; not a suited EVA timeline.",
        },
    }
