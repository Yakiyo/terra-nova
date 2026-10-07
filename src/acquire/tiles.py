"""Sharp imagery tiles for zoomed-in views, from NASA GIBS.

The globe texture is 8192 x 4096 (~5 km per pixel). When the viewer zooms in,
the interface requests detail tiles for the area in view:

    level 1: 10 x 10 degree tiles, 512 px  (~2.2 km per pixel), 36 x 18 tiles
    level 2: 2.5 x 2.5 degree tiles, 512 px (~540 m per pixel), 144 x 72 tiles

Tile (z, row, col) covers latitude 90 - row*size .. 90 - (row+1)*size and
longitude -180 + col*size .. -180 + (col+1)*size. Tiles are cached in
``cache/tiles/`` (gitignored). To make zoomed views work offline on the demo
laptop, prefetch the regions you will show:

    python -m src.acquire.tiles --level 1                     # whole world, 648 tiles, ~20 MB
    python -m src.acquire.tiles --level 2 --bbox 20,50,45,110  # s,w,n,e
    python -m src.acquire.tiles --level 2 --around-top 20      # around every target's top sites

Imagery: NASA Blue Marble (shaded relief and bathymetry) via NASA GIBS.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from src.acquire.download import REPO_ROOT, fetch

TILE_DIR = REPO_ROOT / "cache" / "tiles"
LAYER = "BlueMarble_ShadedRelief_Bathymetry"
WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
TILE_PX = 512
LEVELS = {1: 10.0, 2: 2.5}
CREDIT = "NASA Blue Marble (shaded relief and bathymetry) via NASA GIBS"


class TileError(ValueError):
    """Raised for a tile address outside the grid."""


def tile_bbox(z: int, row: int, col: int) -> tuple[float, float, float, float]:
    """(south, west, north, east) of a tile."""
    if z not in LEVELS:
        raise TileError(f"unknown level {z}")
    size = LEVELS[z]
    rows, cols = round(180 / size), round(360 / size)
    if not (0 <= row < rows and 0 <= col < cols):
        raise TileError(f"tile {z}/{row}/{col} is outside the {rows} x {cols} grid")
    north = 90.0 - row * size
    west = -180.0 + col * size
    return north - size, west, north, west + size


def tile_url(z: int, row: int, col: int) -> str:
    s, w, n, e = tile_bbox(z, row, col)
    return (
        f"{WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS={LAYER}&STYLES="
        f"&CRS=EPSG:4326&BBOX={s},{w},{n},{e}&WIDTH={TILE_PX}&HEIGHT={TILE_PX}"
        "&FORMAT=image/jpeg"
    )


def tile(z: int, row: int, col: int, offline: bool | None = None) -> Path:
    """Local path of a tile, fetched on first use unless offline."""
    tile_bbox(z, row, col)  # validates the address
    item = fetch(
        tile_url(z, row, col),
        filename=f"{row}_{col}.jpg",
        raw_dir=TILE_DIR / str(z),
        offline=offline,
        timeout=20,
        max_seconds=30,
    )
    return item.path


def tiles_in(z: int, south: float, west: float, north: float, east: float) -> list[tuple[int, int]]:
    size = LEVELS[z]
    r0 = max(0, math.floor((90 - north) / size))
    r1 = min(round(180 / size) - 1, math.ceil((90 - south) / size) - 1)
    c0 = max(0, math.floor((west + 180) / size))
    c1 = min(round(360 / size) - 1, math.ceil((east + 180) / size) - 1)
    return [(r, c) for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)]


def _around_top(z: int, top: int) -> list[tuple[int, int]]:
    from fastapi.testclient import TestClient

    from src.api.main import app

    client = TestClient(app)
    out: list[tuple[int, int]] = []
    for target in client.get("/api/targets").json()["targets"]:
        body = client.post(
            "/api/score", json={"target_id": target["id"], "top_k": top, "min_separation_cells": 3}
        ).json()
        for r in body["results"]:
            out += tiles_in(z, r["lat"] - 2, r["lon"] - 2, r["lat"] + 2, r["lon"] + 2)
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Prefetch GIBS detail tiles for offline use.")
    parser.add_argument("--level", type=int, choices=sorted(LEVELS), default=1)
    parser.add_argument("--bbox", default="-90,-180,90,180", help="south,west,north,east")
    parser.add_argument(
        "--around-top", type=int, default=0, help="only tiles within 2 deg of each target's top N"
    )
    args = parser.parse_args(argv)
    if args.around_top:
        wanted = sorted(set(_around_top(args.level, args.around_top)))
    else:
        s, w, n, e = (float(v) for v in args.bbox.split(","))
        wanted = tiles_in(args.level, s, w, n, e)
    for done, (row, col) in enumerate(wanted, start=1):
        tile(args.level, row, col, offline=False)
        if done % 50 == 0:
            print(f"[tiles] level {args.level}: {done}/{len(wanted)}", flush=True)
    print(f"[tiles] level {args.level}: {len(wanted)} tiles in {TILE_DIR.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
