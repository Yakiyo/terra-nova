"""Basaltic volcanic rock from the Global Lithological Map (GLiM), on our 0.5 degree grid.

Source: Hartmann, J. and Moosdorf, N. (2012): Global Lithological Map Database v1.0
(gridded to 0.5 degree spatial resolution). PANGAEA, doi:10.1594/PANGAEA.788537,
licence CC-BY 3.0. The archive holds ``glim_wgs84_0point5deg.txt.asc``, an ESRI ASCII
grid of 720 x 360 cells starting at (-180, -90) with 0.5 degree cells (exactly the
TerraNova grid, first row in the north), giving the *dominant* rock class of each cell,
and ``Classnames.txt``, which maps the grid codes to GLiM class abbreviations.

The criterion ``basaltic_volcanic`` scores each cell by its dominant class:

* ``vb`` basic volcanic rock (basalt)        -> 1.0
* ``vi`` intermediate volcanic rock (andesite) -> 0.5
* any other class, or no data                 -> 0.0

Lava tubes form mainly in fluid basaltic lava, so andesitic ground counts half. This is
the dominant class of a ~55 km cell, not a cave map. Cells without GLiM data (mostly
small islands and coasts) score 0, which keeps the layer finite on all land so it never
removes a cell from scoring for targets that do not use it.

    python -m src.acquire.glim          # build cache/derived/basaltic_volcanic.npy
    python -m src.acquire.build_predictor_stack --stage assemble --offline
    python -m src.acquire.calibrate

The PANGAEA download host sometimes blocks scripted clients. If the download fails, save
the archive from the link printed in the error to ``cache/raw/glim/`` and run again.
"""

from __future__ import annotations

import io
import zipfile

import numpy as np

from src.acquire.download import DEFAULT_RAW_DIR, FetchError, fetch

DATASET_ID = "glim_v1_gridded_0p5deg"
SOURCE_URL = "https://doi.org/10.1594/PANGAEA.788537"
DOWNLOAD_URL = "https://hdl.handle.net/10013/epic.39939.d001"
TITLE = "Global Lithological Map Database v1.0, gridded to 0.5 degrees (Hartmann & Moosdorf 2012), CC-BY 3.0"
RAW_DIR = DEFAULT_RAW_DIR / "glim"
ZIP_NAME = "hartmann-moosdorf_2012.zip"
GRID_NAME = "glim_wgs84_0point5deg.txt.asc"
CLASSES_NAME = "Classnames.txt"

# Dominant class -> score. Everything else (and no data) is 0.
SCORES: dict[str, float] = {"vb": 1.0, "vi": 0.5}
EXPECTED_HEADER = {"ncols": 720.0, "nrows": 360.0, "xllcorner": -180.0, "yllcorner": -90.0, "cellsize": 0.5}


class GlimError(RuntimeError):
    """Raised when the GLiM archive is missing or not what we expect."""


def archive(offline: bool | None = None) -> zipfile.ZipFile:
    """The GLiM archive from cache/raw/glim, downloading it on first use."""
    try:
        item = fetch(DOWNLOAD_URL, filename=ZIP_NAME, raw_dir=RAW_DIR, offline=offline, timeout=120, max_seconds=300)
    except FetchError as exc:
        raise GlimError(
            f"Could not get the GLiM archive ({exc}). Download it from {SOURCE_URL} "
            f"(file {ZIP_NAME}) and save it as {RAW_DIR / ZIP_NAME}, then run again."
        ) from exc
    data = item.path.read_bytes()
    if not data.startswith(b"PK"):
        item.path.unlink(missing_ok=True)   # an HTML challenge page, not the archive
        raise GlimError(
            f"The download from {DOWNLOAD_URL} was not a zip archive (the host may block scripts). "
            f"Download it in a browser from {SOURCE_URL} and save it as {RAW_DIR / ZIP_NAME}."
        )
    return zipfile.ZipFile(io.BytesIO(data))


def read_classes(zf: zipfile.ZipFile) -> dict[int, str]:
    """Grid code -> GLiM class abbreviation, from Classnames.txt."""
    lines = zf.read(CLASSES_NAME).decode("ascii").strip().splitlines()
    header = [h.strip('"') for h in lines[0].split(";")]
    value_col, name_col = header.index("Value_"), header.index("xx")
    classes = {}
    for line in lines[1:]:
        cells = [c.strip().strip('"') for c in line.split(";")]
        classes[int(float(cells[value_col]))] = cells[name_col]
    return classes


def read_grid(zf: zipfile.ZipFile) -> tuple[np.ndarray, float]:
    """The class-code grid (360 x 720, north first) and its no-data value."""
    text = zf.read(GRID_NAME).decode("ascii")
    lines = text.splitlines()
    header = {}
    for line in lines[:6]:
        key, value = line.split()
        header[key.lower()] = float(value)
    for key, expected in EXPECTED_HEADER.items():
        if header.get(key) != expected:
            raise GlimError(f"{GRID_NAME}: {key} is {header.get(key)}, expected {expected}")
    grid = np.loadtxt(io.StringIO("\n".join(lines[6:])))
    if grid.shape != (360, 720):
        raise GlimError(f"{GRID_NAME}: grid shape {grid.shape}, expected (360, 720)")
    return grid, header["nodata_value"]


def basaltic_volcanic(grid: np.ndarray, classes: dict[int, str], nodata: float) -> np.ndarray:
    """Score each cell by its dominant rock class (see the module docstring)."""
    out = np.zeros(grid.shape, dtype=np.float32)
    for code, name in classes.items():
        if name in SCORES:
            out[grid == code] = SCORES[name]
    out[grid == nodata] = 0.0
    return out


def build(offline: bool | None = None) -> np.ndarray:
    """The basaltic_volcanic layer on the TerraNova grid."""
    with archive(offline) as zf:
        classes = read_classes(zf)
        missing = set(SCORES) - set(classes.values())
        if missing:
            raise GlimError(f"{CLASSES_NAME} has no class {sorted(missing)}")
        grid, nodata = read_grid(zf)
    return basaltic_volcanic(grid, classes, nodata)


def main() -> int:
    from src.acquire.build_predictor_stack import stage_lithology

    layer = stage_lithology(force=True)
    print(
        f"[glim] basaltic_volcanic: {int((layer == 1.0).sum())} basalt cells, "
        f"{int((layer == 0.5).sum())} intermediate volcanic cells"
    )
    print("[glim] next: python -m src.acquire.build_predictor_stack --stage assemble --offline "
          "&& python -m src.acquire.calibrate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
