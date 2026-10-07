"""Build the offline globe textures in ``web/assets/``.

    python -m src.acquire.basemaps            # everything (needs network)
    python -m src.acquire.basemaps --small    # only the small copies, from the files above

* Earth: NASA Blue Marble with shaded relief and bathymetry, from NASA GIBS.
  ``earth_hd.jpg`` is 8192 x 4096 (~5 km/px) for the globe on GPUs that allow
  8K textures; ``earth.jpg`` is the 4096 x 2048 fallback.
* Moon:  LRO WAC global mosaic, stitched from NASA Moon Trek WMTS tiles.
* Mars:  Viking MDIM 2.1 colour mosaic, stitched from NASA Mars Trek WMTS tiles.

Moon and Mars are 4096 x 2048. Every output is an equirectangular JPEG (plate carree, -180..180,
90..-90), so the frontend can wrap it on a sphere or draw it flat.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

from src.acquire.download import REPO_ROOT, fetch

OUT = REPO_ROOT / "web" / "assets"
SIZE = (4096, 2048)

GIBS_WMS = (
    "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap"
    "&VERSION=1.3.0&LAYERS=BlueMarble_ShadedRelief_Bathymetry&STYLES=&CRS=EPSG:4326"
    "&FORMAT=image/jpeg&WIDTH=4096&HEIGHT=4096"
)
TREK = "https://trek.nasa.gov/tiles"
TREK_LAYERS = {
    "moon": "Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02",
    "mars": "Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m",
}
TREK_LEVEL = 3  # 16 x 8 tiles of 256 px = 4096 x 2048

CREDITS = {
    "earth": ("NASA Blue Marble (shaded relief and bathymetry) via NASA GIBS", GIBS_WMS),
    "moon": ("NASA Moon Trek, LRO WAC Global Mosaic", "https://trek.nasa.gov/moon/"),
    "mars": ("NASA Mars Trek, Viking MDIM 2.1 Colour Mosaic", "https://trek.nasa.gov/mars/"),
}


def earth(offline: bool | None = None) -> Path:
    """Two 4096 x 4096 GIBS halves (west, east) stitched into 8192 x 4096."""
    canvas = Image.new("RGB", (8192, 4096))
    for i, (west, east) in enumerate(((-180, 0), (0, 180))):
        url = f"{GIBS_WMS}&BBOX=-90,{west},90,{east}"
        item = fetch(url, filename=f"gibs_bluemarble_relief_{i}.jpg", offline=offline, timeout=300)
        with Image.open(item.path) as half:
            canvas.paste(half.convert("RGB"), (i * 4096, 0))
    hd = OUT / "earth_hd.jpg"
    canvas.save(hd, quality=86)
    canvas.resize(SIZE, Image.Resampling.LANCZOS).save(OUT / "earth.jpg", quality=88)
    return hd


def trek(body: str, offline: bool | None = None) -> Path:
    layer = TREK_LAYERS[body]
    cols, rows = 2 ** (TREK_LEVEL + 1), 2**TREK_LEVEL
    canvas = Image.new("RGB", (cols * 256, rows * 256))
    for row in range(rows):
        for col in range(cols):
            url = f"{TREK}/{layer}/1.0.0/default/default028mm/{TREK_LEVEL}/{row}/{col}.jpg"
            item = fetch(url, filename=f"trek_{body}_{TREK_LEVEL}_{row}_{col}.jpg", offline=offline)
            with Image.open(item.path) as tile:
                canvas.paste(tile.convert("RGB"), (col * 256, row * 256))
    out = OUT / f"{body}.jpg"
    canvas.resize(SIZE, Image.Resampling.LANCZOS).save(out, quality=86)
    return out


SMALL = (1024, 512)


def small() -> list[Path]:
    """1024 x 512 copies for decoration (background Moon and Mars, target icons): no network."""
    out = []
    for body in ("earth", "moon", "mars"):
        path = OUT / f"{body}_sm.jpg"
        with Image.open(OUT / f"{body}.jpg") as image:
            image.convert("RGB").resize(SMALL, Image.Resampling.LANCZOS).save(path, quality=84)
        out.append(path)
    return out


def main(argv: list[str] | None = None) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    built = small() if argv == ["--small"] else [earth(), trek("moon"), trek("mars"), *small()]
    for path in built:
        print(f"[basemaps] wrote {path.relative_to(REPO_ROOT)} ({path.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    import sys

    raise SystemExit(main(sys.argv[1:]))
