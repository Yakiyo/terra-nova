"""Relief-shaded satellite previews for the hover card (and their 3D heightmap).

For the 0.5 degree cell under the cursor, a 2 x 2 degree window is built from:

* Sentinel-2 cloudless 2020 imagery (EOxCloudless, zoom 9, ~300 m/px), and
* AWS Terrain Tiles (zoom 9), turned into a hillshade that is blended into the
  imagery, so ridges, gullies and crater walls read in depth.

The same elevation window, reduced to 64 x 64, drives the small rotating 3D
terrain in the card. Results are cached in ``cache/peek/`` (gitignored).
"""

from __future__ import annotations

import base64
import json
import math
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

from src.acquire import sitetiles
from src.acquire.download import REPO_ROOT, fetch
from src.compute import terrain

CACHE = REPO_ROOT / "cache" / "peek"
ZOOM = 9
SPAN = 2.0  # degrees, same window as the Blue Marble thumbnails
SIZE = 384  # output image px
GRID = 64  # heightmap samples per side
EOX = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"


def _tile_image(url: str, name: str, sub: str, offline: bool | None) -> np.ndarray:
    item = fetch(
        url,
        filename=name,
        raw_dir=CACHE / "tiles" / sub,
        offline=offline,
        timeout=20,
        max_seconds=30,
    )
    with Image.open(item.path) as image:
        return np.asarray(image.convert("RGB"))


def _window(lat: float, lon: float) -> tuple[float, float, float, float]:
    half = SPAN / 2
    north = min(terrain.MAX_MERCATOR_LAT - 0.5, lat + half)
    south = max(-terrain.MAX_MERCATOR_LAT + 0.5, lat - half)
    return south, lon - half, north, lon + half


def _one(kind: str, x: int, y: int, offline: bool | None) -> np.ndarray:
    xx = x % 2**ZOOM
    if kind == "img":
        return _tile_image(EOX.format(z=ZOOM, x=xx, y=y), f"{y}_{xx}.jpg", "s2", offline)
    url = sitetiles.TERRARIUM.format(z=ZOOM, x=xx, y=y)
    return _tile_image(url, f"{y}_{xx}.png", "dem", offline)


def _mosaic(kind: str, x0: int, x1: int, y0: int, y1: int, offline: bool | None) -> np.ndarray:
    xs, ys = range(x0, x1 + 1), range(y0, y1 + 1)
    with ThreadPoolExecutor(max_workers=8) as pool:
        tiles = list(
            pool.map(lambda xy: _one(kind, xy[0], xy[1], offline), [(x, y) for y in ys for x in xs])
        )
    w = len(xs)
    return np.vstack([np.hstack(tiles[r * w : (r + 1) * w]) for r in range(len(ys))])


def build(lat: float, lon: float, offline: bool | None = None) -> dict[str, object]:
    """Compose (or load from cache) the preview for the cell centred at lat/lon."""
    key = f"{lat:+07.2f}_{lon:+08.2f}"
    jpg = CACHE / f"{key}.jpg"
    meta = CACHE / f"{key}.json"
    if jpg.exists() and meta.exists():
        return json.loads(meta.read_text(encoding="utf-8"))

    south, west, north, east = _window(lat, lon)
    fx0, fy0 = terrain.lonlat_to_tile(north, west, ZOOM)
    fx1, fy1 = terrain.lonlat_to_tile(south, east, ZOOM)
    x0, x1, y0, y1 = math.floor(fx0), math.floor(fx1), math.floor(fy0), math.floor(fy1)
    img = _mosaic("img", x0, x1, y0, y1, offline)
    dem = terrain.decode_terrarium(_mosaic("dem", x0, x1, y0, y1, offline))

    # Crop to the exact window (pixel coordinates inside the mosaic).
    c0, c1 = _px(fx0, x0), _px(fx1, x0)
    r0, r1 = _px(fy0, y0), _px(fy1, y0)
    img = img[r0:r1, c0:c1]
    dem = dem[r0:r1, c0:c1]

    cell_m = float(terrain.pixel_size_m(ZOOM, np.array([lat]))[0])
    shade = terrain.hillshade(dem, cell_m, exaggeration=3.0)
    blended = img.astype(np.float64) * (0.45 + 0.8 * shade[..., None])
    out = Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8)).resize(
        (SIZE, SIZE), Image.Resampling.LANCZOS
    )
    CACHE.mkdir(parents=True, exist_ok=True)
    out.save(jpg, quality=85)

    small = np.asarray(
        Image.fromarray(dem.astype(np.float32), mode="F").resize(
            (GRID, GRID), Image.Resampling.BILINEAR
        )
    )
    height_km = abs(north - south) * 111.32
    width_km = abs(east - west) * 111.32 * math.cos(math.radians(lat))
    info = {
        "key": key,
        "window": {"south": south, "west": west, "north": north, "east": east},
        "size_km": [round(width_km, 1), round(height_km, 1)],
        "relief_m": round(float(dem.max() - dem.min()), 1),
        "elevation_min_m": round(float(dem.min()), 1),
        "heightmap": {
            "shape": [GRID, GRID],
            "data": _b64(small.astype("<f4").tobytes()),
        },
        "credit": sitetiles.IMAGERY["s2"]["credit"] + "; hillshade from AWS Terrain Tiles",
    }
    meta.write_text(json.dumps(info), encoding="utf-8")
    return info


def _px(fraction: float, origin: int) -> int:
    return round((fraction - origin) * 256)


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def image_path(lat: float, lon: float):
    return CACHE / f"{lat:+07.2f}_{lon:+08.2f}.jpg"


def main() -> int:
    """Prefetch previews for every target's top 20 (default and discovery ranking)."""
    from fastapi.testclient import TestClient

    from src.acquire import thumbs
    from src.api.main import app

    client = TestClient(app)
    points: set[tuple[float, float]] = set()
    discovery = {"new_only": True, "max_per_country": 2, "min_distance_km": 800}
    for target in client.get("/api/targets").json()["targets"]:
        for extra in ({}, discovery):
            body = client.post(
                "/api/score",
                json={"target_id": target["id"], "top_k": 20, "min_separation_cells": 3, **extra},
            ).json()
            points |= {(r["lat"], r["lon"]) for r in body["results"]}
    points |= {
        thumbs.cell_centre(s["lat"], s["lon"]) for s in client.get("/api/analogs").json()["sites"]
    }
    done = 0
    for lat, lon in sorted(points):
        if abs(lat) > terrain.MAX_MERCATOR_LAT - 1.5:
            continue
        try:
            build(lat, lon, offline=False)
            done += 1
        except Exception as exc:  # keep going
            print(f"[peek] {lat},{lon} failed: {exc}", flush=True)
    print(f"[peek] {done} previews in {CACHE}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
