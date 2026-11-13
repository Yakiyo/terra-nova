"""Context layers that characterise a site beyond the nine scored conditions.

Not scored (the ranking and its validation stay unchanged); shown with every site so a
match can be described by its *processes* as well as its numbers:

* dust  - NASA MERRA-2 dust surface mass concentration, monthly 2023 via NASA GIBS
          (``MERRA2_Dust_Surface_Mass_Concentration_Monthly``), decoded with the
          published GIBS colour map, annual mean in micrograms per cubic metre.
* snow  - NASA MODIS Terra L3 monthly snow cover via NASA GIBS
          (``MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct``): the number of 2023
          months with snow or ice observed in the cell (0-12). Polar night months have
          no observation, so ice sheets are counted from their sunlit months.

Both images are requested directly on the app's 0.5 degree grid (720 x 360).

    python -m src.acquire.context_layers
"""

from __future__ import annotations

import re
import sys

import numpy as np
from PIL import Image

from src.acquire.download import DEFAULT_RAW_DIR, REPO_ROOT, fetch

YEAR = 2023
WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
RAW_DIR = DEFAULT_RAW_DIR / "gibs_context"
OUT = REPO_ROOT / "cache" / "context.npz"
DUST = "MERRA2_Dust_Surface_Mass_Concentration_Monthly"
SNOW = "MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct"
DUST_COLORMAP = f"https://gibs.earthdata.nasa.gov/colormaps/v1.3/{DUST}.xml"
_ENTRY = re.compile(r'<ColorMapEntry rgb="(\d+),(\d+),(\d+)"[^>]*?value="\[([-+\w.]+),')


def _url(layer: str, month: int) -> str:
    return (f"{WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS={layer}&STYLES="
            f"&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=720&HEIGHT=360"
            f"&FORMAT=image/png&TIME={YEAR}-{month:02d}-01")


def _rgba(layer: str, month: int) -> np.ndarray:
    item = fetch(_url(layer, month), filename=f"{layer}_{YEAR}-{month:02d}.png",
                 raw_dir=RAW_DIR, timeout=120)
    with Image.open(item.path) as image:
        return np.asarray(image.convert("RGBA"))


def _key(rgba: np.ndarray) -> np.ndarray:
    return ((rgba[..., 0].astype(np.uint32) << 16) | (rgba[..., 1].astype(np.uint32) << 8)
            | rgba[..., 2].astype(np.uint32))


def dust() -> np.ndarray:
    text = fetch(DUST_COLORMAP, filename=f"{DUST}.xml", raw_dir=RAW_DIR).path.read_text("utf-8")
    lut = np.full(1 << 24, np.nan, dtype=np.float32)
    for r, g, b, low in _ENTRY.findall(text):
        value = 0.0 if "INF" in low else float(low)
        lut[(int(r) << 16) | (int(g) << 8) | int(b)] = max(value, 0.0) * 1e9  # kg/m3 -> ug/m3
    total = np.zeros((360, 720), np.float64)
    count = np.zeros((360, 720), np.int32)
    for month in range(1, 13):
        rgba = _rgba(DUST, month)
        v = lut[_key(rgba)]
        ok = np.isfinite(v) & (rgba[..., 3] > 0)
        total[ok] += v[ok]
        count[ok] += 1
        print(f"  dust {YEAR}-{month:02d}: {int(ok.sum())} cells decoded", flush=True)
    out = np.full((360, 720), np.nan, np.float32)
    has = count > 0
    out[has] = (total[has] / count[has]).astype(np.float32)
    return out


def snow() -> np.ndarray:
    months = np.zeros((360, 720), np.float32)
    for month in range(1, 13):
        rgba = _rgba(SNOW, month)
        months += (rgba[..., 3] > 0)
        print(f"  snow {YEAR}-{month:02d}: {int((rgba[..., 3] > 0).sum())} snowy cells", flush=True)
    return months


def main() -> int:
    print("Building context layers from NASA GIBS (dust, snow/ice)...", flush=True)
    d, s = dust(), snow()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(OUT, dust=d, snow_months=s)
    print(f"wrote {OUT}  dust median {np.nanmedian(d):.1f} ug/m3, "
          f"cells with snow: {int((s > 0).sum())}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
