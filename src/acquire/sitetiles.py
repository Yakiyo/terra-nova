"""Elevation and imagery tiles for the God's Eye site view.

Elevation: AWS Terrain Tiles (Terrarium encoding), zoom 10 (~150 m/px at the
equator). Mosaic: 4 x 4 tiles (1024 x 1024 px, ~157 km at the equator), centred on the
scored 0.5 degree cell to the nearest tile.

Imagery (fetched by the browser through ``/api/imagery``):
  ``s2``  EOxCloudless Sentinel-2 2020, zoom 10, ESA Copernicus data
          processed by EOX. Licence: CC BY-NC-SA 4.0 (non-commercial, e.g.
          student and university projects). Attribution is shown in the view.

Everything is cached under ``cache/sitetiles/`` (gitignored). Prefetch the top
sites for an offline demo:

    python -m src.acquire.sitetiles            # top 20 of every target, as the Finder lists them
"""

from __future__ import annotations

import argparse
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

from src.acquire.download import REPO_ROOT, fetch
from src.compute import terrain

CACHE = REPO_ROOT / "cache" / "sitetiles"
DEM_ZOOM = 10
MOSAIC = 4  # tiles per side
TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
IMAGERY = {
    "s2": {
        "url": "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg",
        "zoom": DEM_ZOOM,
        "credit": (
            "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH "
            "(Contains modified Copernicus Sentinel data 2020)"
        ),
        "licence": "CC BY-NC-SA 4.0",
    },
}
DEM_CREDIT = "AWS Terrain Tiles (Terrarium): SRTM, GMTED, ETOPO1 and others"


# Highest |latitude| a site view is built for: the mosaic needs tiles north and south of it.
MAX_SITE_LAT = terrain.MAX_MERCATOR_LAT - 1.0


class SiteTileError(ValueError):
    """Raised for a location or tile request that cannot be served."""


def mosaic_origin(lat: float, lon: float) -> tuple[int, int]:
    """Top-left tile (x0, y0) of the mosaic around a point."""
    if abs(lat) > MAX_SITE_LAT:
        raise SiteTileError("elevation tiles do not cover latitudes beyond about +/-84 degrees")
    x, y = terrain.lonlat_to_tile(lat, lon, DEM_ZOOM)
    n = 2**DEM_ZOOM
    half = MOSAIC / 2
    y0 = min(max(round(y - half), 0), n - MOSAIC)
    return round(x - half), y0


def dem_tile(x: int, y: int, offline: bool | None = None) -> np.ndarray:
    n = 2**DEM_ZOOM
    x %= n
    item = fetch(
        TERRARIUM.format(z=DEM_ZOOM, x=x, y=y),
        filename=f"{y}_{x}.png",
        raw_dir=CACHE / "dem" / str(DEM_ZOOM),
        offline=offline,
        timeout=20,
        max_seconds=30,
    )
    with Image.open(item.path) as image:
        return terrain.decode_terrarium(np.asarray(image.convert("RGB")))


def dem_mosaic(x0: int, y0: int, offline: bool | None = None) -> np.ndarray:
    coords = [(x0 + i, y0 + j) for j in range(MOSAIC) for i in range(MOSAIC)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        tiles = list(pool.map(lambda c: dem_tile(c[0], c[1], offline), coords))
    rows = [np.hstack(tiles[j * MOSAIC : (j + 1) * MOSAIC]) for j in range(MOSAIC)]
    return np.vstack(rows)


def imagery_tile(source: str, z: int, x: int, y: int, offline: bool | None = None) -> Path:
    if source not in IMAGERY:
        raise SiteTileError(f"unknown imagery source {source!r}")
    spec = IMAGERY[source]
    if z != spec["zoom"]:
        raise SiteTileError(f"{source} is served at zoom {spec['zoom']} only")
    n = 2**z
    if not (0 <= y < n):
        raise SiteTileError("tile row outside the grid")
    x %= n
    item = fetch(
        spec["url"].format(z=z, x=x, y=y),
        filename=f"{y}_{x}.jpg",
        raw_dir=CACHE / source / str(z),
        offline=offline,
        timeout=20,
        max_seconds=30,
    )
    return item.path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Prefetch God's Eye tiles for top sites.")
    parser.add_argument("--top", type=int, default=20, help="top N sites of every target")
    parser.add_argument("--terrain-only", action="store_true", help="skip satellite imagery")
    args = parser.parse_args(argv)

    # Acquisition explicitly prepares caches, including from an OFFLINE=1 shell.
    previous_offline = os.environ.get("OFFLINE")
    os.environ["OFFLINE"] = "0"
    try:
        return _prepare_sites(args.top, args.terrain_only)
    finally:
        if previous_offline is None:
            os.environ.pop("OFFLINE", None)
        else:
            os.environ["OFFLINE"] = previous_offline


def _prepare_sites(top: int, terrain_only: bool) -> int:
    from fastapi.testclient import TestClient

    from src.acquire.finder_sites import finder_sites
    from src.api.main import app

    client = TestClient(app)
    # Exactly the sites the Finder lists (its filters and each target's default weights).
    sites = {(lat, lon) for lat, lon in finder_sites(top) if abs(lat) <= MAX_SITE_LAT}

    def prepare(site: tuple[float, float]) -> bool:
        lat, lon = site
        try:
            payload = client.get("/api/site3d", params={"lat": lat, "lon": lon}).json()
        except Exception as exc:  # keep going; report at the end
            print(f"[sitetiles] {lat},{lon} failed: {exc}")
            return False
        if "imagery" not in payload:
            print(f"[sitetiles] {lat},{lon}: {payload.get('detail')}")
            return False
        if terrain_only:
            return True
        success = True
        img = payload["imagery"]["s2"]
        for ty in range(img["y0"], img["y0"] + img["tiles"]):
            for tx in range(img["x0"], img["x0"] + img["tiles"]):
                try:
                    imagery_tile("s2", img["zoom"], tx, ty, offline=False)
                except Exception as exc:
                    success = False
                    print(f"[sitetiles] {lat},{lon} imagery failed: {exc}", flush=True)
        return success

    success = True
    with ThreadPoolExecutor(max_workers=4) as pool:
        for done, ready in enumerate(pool.map(prepare, sorted(sites)), start=1):
            success = success and ready
            print(f"[sitetiles] {done}/{len(sites)} {'ready' if ready else 'failed'}", flush=True)
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
