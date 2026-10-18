"""Local terrain statistics for one site, from a Web Mercator elevation mosaic.

Deterministic numpy only. Used by the God's Eye view: the 0.5 degree screening
grid says *where* to look; this module measures the terrain there at the
elevation tiles' native ~150 m spacing (zoom 10), which is much closer to the
tens-of-metres baselines of the Moon and Mars target measurements.

Coordinates
-----------
Web Mercator tiles (EPSG:3857, "slippy map" numbering). At zoom ``z`` a pixel is
``156543.03392 * cos(lat) / 2**z`` metres on the ground, so the east-west and
north-south spacing both shrink with latitude and are computed per row.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

EARTH_CIRCUMFERENCE_M = 40075016.686
MAX_MERCATOR_LAT = 85.0511287798
TRAFFICABLE_DEG = 15.0  # rover trafficability / landing limit used in the research notes


def lonlat_to_tile(lat: float, lon: float, z: int) -> tuple[float, float]:
    """Fractional slippy-map tile coordinates (x, y) of a point."""
    lat = max(-MAX_MERCATOR_LAT, min(MAX_MERCATOR_LAT, lat))
    n = 2**z
    x = (lon + 180.0) / 360.0 * n
    rad = math.radians(lat)
    y = (1.0 - math.asinh(math.tan(rad)) / math.pi) / 2.0 * n
    return x, y


def tile_to_lat(y: float, z: int) -> float:
    """Latitude of a (fractional) tile row edge."""
    return math.degrees(math.atan(math.sinh(math.pi * (1.0 - 2.0 * y / 2**z))))


def tile_to_lon(x: float, z: int) -> float:
    return x / 2**z * 360.0 - 180.0


def decode_terrarium(rgb: np.ndarray) -> np.ndarray:
    """Terrarium PNG encoding: ``elevation = R * 256 + G + B / 256 - 32768`` metres."""
    r = rgb[..., 0].astype(np.float64)
    g = rgb[..., 1].astype(np.float64)
    b = rgb[..., 2].astype(np.float64)
    return r * 256.0 + g + b / 256.0 - 32768.0


def pixel_size_m(z: int, lat: np.ndarray, tile_px: int = 256) -> np.ndarray:
    """Ground size of one pixel (metres) at each latitude."""
    return EARTH_CIRCUMFERENCE_M * np.cos(np.radians(lat)) / (2**z * tile_px)


def slope_degrees(dem: np.ndarray, row_lat: np.ndarray, z: int) -> np.ndarray:
    """Slope of every pixel from central differences, with per-row pixel size."""
    size = pixel_size_m(z, row_lat)[:, None]
    dz_dy, dz_dx = np.gradient(dem)
    return np.degrees(np.arctan(np.hypot(dz_dx / size, dz_dy / size)))


@dataclass(frozen=True)
class Stats:
    elevation_min: float
    elevation_max: float
    elevation_mean: float
    relief: float
    slope_mean: float
    slope_median: float
    slope_p90: float
    share_under_5: float
    share_under_15: float
    pixels: int

    def as_dict(self) -> dict[str, float | int]:
        return {k: (round(v, 3) if isinstance(v, float) else v) for k, v in self.__dict__.items()}


def stats(dem: np.ndarray, slope: np.ndarray, mask: np.ndarray | None = None) -> Stats:
    """Elevation and slope summary over the pixels in ``mask`` (all when None)."""
    sel = np.ones(dem.shape, dtype=bool) if mask is None else mask
    e = dem[sel]
    s = slope[sel]
    if e.size == 0:
        raise ValueError("empty terrain selection")
    return Stats(
        elevation_min=float(e.min()),
        elevation_max=float(e.max()),
        elevation_mean=float(e.mean()),
        relief=float(e.max() - e.min()),
        slope_mean=float(s.mean()),
        slope_median=float(np.median(s)),
        slope_p90=float(np.percentile(s, 90)),
        share_under_5=float((s < 5.0).mean()),
        share_under_15=float((s < TRAFFICABLE_DEG).mean()),
        pixels=int(e.size),
    )


def hillshade(
    dem: np.ndarray,
    cell_m: float,
    azimuth: float = 315.0,
    altitude: float = 45.0,
    exaggeration: float = 2.0,
) -> np.ndarray:
    """Standard hillshade (0 = full shadow, 1 = facing the light) of a DEM.

    ``cell_m`` is the ground size of one pixel; the light comes from
    ``azimuth`` degrees clockwise from north, ``altitude`` degrees above the
    horizon. Rows run north to south.
    """
    dz_dy, dz_dx = np.gradient(dem * exaggeration, cell_m)
    slope = np.arctan(np.hypot(dz_dx, dz_dy))
    # Aspect = compass direction the slope faces (downhill), clockwise from north.
    # Downhill is minus the gradient; rows increase southwards, so north = -row.
    aspect = np.arctan2(-dz_dx, dz_dy)
    zenith = np.radians(90.0 - altitude)
    az = np.radians(azimuth)
    shade = np.cos(zenith) * np.cos(slope) + np.sin(zenith) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(shade, 0.0, 1.0)


def block_mean(a: np.ndarray, k: int) -> np.ndarray:
    """Mean of non-overlapping k x k blocks (shape must divide by k)."""
    h, w = a.shape
    return a.reshape(h // k, k, w // k, k).mean(axis=(1, 3))


def display_slopes(heights: np.ndarray, ground_size_m: float) -> np.ndarray:
    """Display-grid slopes, matching the mesh spacing and clamped edge differences.

    Kept here so the browser only renders measurements, including probe values.
    Native-resolution terrain statistics continue to use slope_degrees.
    """
    rows, cols = heights.shape
    spacing = ground_size_m / (cols - 1)
    padded = np.pad(heights, 1, mode="edge")
    dx = (padded[1 : rows + 1, 2 : cols + 2] - padded[1 : rows + 1, :cols]) / (2 * spacing)
    dy = (padded[2 : rows + 2, 1 : cols + 1] - padded[:rows, 1 : cols + 1]) / (2 * spacing)
    return np.degrees(np.arctan(np.hypot(dx, dy)))


def cell_mask(
    row_lat: np.ndarray,
    col_lon: np.ndarray,
    south: float,
    west: float,
    north: float,
    east: float,
) -> np.ndarray:
    """Boolean mask of mosaic pixels whose centres fall inside a lat/lon box."""
    rows = (row_lat >= south) & (row_lat < north)
    cols = (col_lon >= west) & (col_lon < east)
    return rows[:, None] & cols[None, :]
