"""Preview images of Earth locations from NASA GIBS (Blue Marble Next Generation).

Each preview is a 2 x 2 degree cloud-free snapshot centred on a 0.5 degree grid
cell (the cell itself is outlined by the interface). Files are cached in
``cache/thumbs/`` (committed), so previews of the demo sites work offline:

    python -m src.acquire.thumbs          # prefetch top sites + known analogs

Imagery: NASA Earth Observatory Blue Marble Next Generation (~500 m), served by
NASA GIBS. No authentication.
"""

from __future__ import annotations

from pathlib import Path

from src.acquire.download import REPO_ROOT, fetch

THUMB_DIR = REPO_ROOT / "cache" / "thumbs"
LAYER = "BlueMarble_NextGeneration"
SPAN_DEG = 2.0
SIZE_PX = 320
WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
CREDIT = "NASA Blue Marble Next Generation via NASA GIBS"


def cell_centre(lat: float, lon: float) -> tuple[float, float]:
    """Centre of the 0.5 degree cell containing (lat, lon)."""
    row = min(max(int((90.0 - lat) // 0.5), 0), 359)
    col = min(max(int((lon + 180.0) // 0.5), 0), 719)
    return 90.0 - (row + 0.5) * 0.5, -179.75 + col * 0.5


def bbox(lat: float, lon: float) -> tuple[float, float, float, float]:
    """(south, west, north, east) of the preview, clipped to the globe."""
    half = SPAN_DEG / 2
    south = max(-90.0, lat - half)
    north = min(90.0, lat + half)
    west = max(-180.0, lon - half)
    east = min(180.0, lon + half)
    return south, west, north, east


def url(lat: float, lon: float) -> str:
    s, w, n, e = bbox(lat, lon)
    return (
        f"{WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS={LAYER}&STYLES="
        f"&CRS=EPSG:4326&BBOX={s},{w},{n},{e}&WIDTH={SIZE_PX}&HEIGHT={SIZE_PX}"
        "&FORMAT=image/jpeg"
    )


def filename(lat: float, lon: float) -> str:
    return f"bm_{lat:+07.2f}_{lon:+08.2f}.jpg"


def thumbnail(lat: float, lon: float, offline: bool | None = None) -> Path:
    """Local path of the preview for the cell containing (lat, lon)."""
    clat, clon = cell_centre(lat, lon)
    item = fetch(
        url(clat, clon),
        filename=filename(clat, clon),
        raw_dir=THUMB_DIR,
        offline=offline,
        timeout=20,
        max_seconds=30,
    )
    return item.path


def main() -> int:
    from fastapi.testclient import TestClient

    from src.api.main import app

    client = TestClient(app)
    points: list[tuple[float, float]] = []
    for target in client.get("/api/targets").json()["targets"]:
        body = client.post(
            "/api/score",
            json={"target_id": target["id"], "top_k": 60, "min_separation_cells": 3},
        ).json()
        points += [(r["lat"], r["lon"]) for r in body["results"]]
    points += [(s["lat"], s["lon"]) for s in client.get("/api/analogs").json()["sites"]]
    unique = sorted({cell_centre(lat, lon) for lat, lon in points})
    for done, (lat, lon) in enumerate(unique, start=1):
        thumbnail(lat, lon, offline=False)
        if done % 20 == 0:
            print(f"[thumbs] {done}/{len(unique)}", flush=True)
    size = sum(p.stat().st_size for p in THUMB_DIR.glob("*.jpg")) // 1024
    print(f"[thumbs] {len(unique)} previews in {THUMB_DIR.relative_to(REPO_ROOT)} ({size} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
