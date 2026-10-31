"""Build ``cache/predictors.zarr`` from the raw inputs cached under ``cache/raw``.

    python -m src.acquire.build_predictor_stack

Grid
----
Every predictor is a ``(360, 720)`` float32 array of 0.5 degree cells in
EPSG:4326. Row 0 is centred on 89.75 N, column 0 on 179.75 W. Cells that are
less than 50 % land are written as NaN, so ``similarity.valid_mask`` is exactly
the candidate-land mask and no post-hoc filtering is needed.

Stages (each caches its 0.5 degree arrays under ``cache/derived``):

``land``
    Natural Earth 1:50m land minus lakes, rasterised at 1/12 degree and
    block-averaged to a land fraction. Covers Antarctica; excludes the Caspian.
``dem``
    256 AWS Terrarium tiles at zoom 4 are decoded, warped to a 1/12 degree
    lat/lon grid and masked to land. Elevation is the 6 x 6 block mean; slope is
    the horizontal gradient of the 0.5 degree field; roughness is the RMS height
    residual about a least-squares plane over a 3 x 3 neighbourhood of the
    1/12 degree grid, block-averaged.
``power``
    NASA POWER (MERRA-2, 2001-2020) climatology: annual precipitation
    (PRECTOTCORR x 365.25), annual temperature range (warmest minus coldest
    monthly mean T2M), mean annual temperature (mean of the 12 monthly T2M),
    plus TS_RANGE for the LST gap fill.
``lst``
    MODIS Terra LST long-term day minus night (Zenodo 6458406). Cells MODIS does
    not cover (Antarctica, some high Arctic) are filled from POWER TS_RANGE by a
    least-squares fit over the cells both cover; ``lst_source`` records which.
``vegetation``
    Annual maximum MODIS Terra monthly NDVI (2023) from NASA GIBS, clipped at 0.
"""

from __future__ import annotations

import argparse
import json
import shutil
import time
from pathlib import Path

import numpy as np
import rasterio
import zarr
from PIL import Image
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from scipy.ndimage import distance_transform_edt

from src.acquire import gibs_ndvi, landmask, power
from src.acquire.download import REPO_ROOT, fetch, utc_now_iso
from src.compute import terrain
from src.compute.similarity import CRITERIA

RAW_DIR = REPO_ROOT / "cache" / "raw"
DERIVED_DIR = REPO_ROOT / "cache" / "derived"
STACK_PATH = REPO_ROOT / "cache" / "predictors.zarr"
NORM_PATH = REPO_ROOT / "data" / "normalization.json"

CRS = "EPSG:4326"
NROW = 360
NCOL = 720
CELL = 0.5
BLOCK = 6
SUB_CELL = CELL / BLOCK
SROW = NROW * BLOCK
SCOL = NCOL * BLOCK

GRID_TRANSFORM = from_origin(-180.0, 90.0, CELL, CELL)
SUB_TRANSFORM = from_origin(-180.0, 90.0, SUB_CELL, SUB_CELL)

LAT_CELL = 90.0 - (np.arange(NROW) + 0.5) * CELL
LON_CELL = -180.0 + (np.arange(NCOL) + 0.5) * CELL
LAT_SUB = 90.0 - (np.arange(SROW) + 0.5) * SUB_CELL

M_PER_DEG_LAT = 111132.0
M_PER_DEG_LON = 111320.0

TERRARIUM_ZOOM = 4
TERRARIUM_TILES = 2**TERRARIUM_ZOOM
TERRARIUM_PX = 256
MERC_PX = TERRARIUM_TILES * TERRARIUM_PX
MERC_RES = 156543.03392804097 / (2**TERRARIUM_ZOOM)
MERC_HALF = MERC_RES * MERC_PX / 2.0
MERC_TRANSFORM = from_origin(-MERC_HALF, MERC_HALF, MERC_RES, MERC_RES)

# Remote inputs. Each is fetched once through src.acquire.download.fetch and
# then reused from cache/raw, so a second run - or OFFLINE=1 - never touches
# the network.
TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium"
DAYS_PER_YEAR = 365.25

LST_RECORD = "https://zenodo.org/api/records/6458406/files"
LST_DAY = RAW_DIR / "zenodo_lst_day.tif"
LST_NIGHT = RAW_DIR / "zenodo_lst_night.tif"
LST_SCALE = 0.02

LAND_FRACTION_MIN = 0.5


class BuildError(RuntimeError):
    """Raised when a raw input does not match what this build expects."""


def _log(message: str) -> None:
    print(f"[build] {message}", flush=True)


def _cache(name: str) -> Path:
    return DERIVED_DIR / f"{name}.npy"


def _load(name: str, force: bool) -> np.ndarray | None:
    path = _cache(name)
    if path.exists() and not force:
        _log(f"{name}: using cached {_cache(name).name}")
        return np.load(path)
    return None


def _store(name: str, array: np.ndarray) -> np.ndarray:
    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    np.save(_cache(name), array)
    return array


def _raw(name: str, url: str, offline: bool | None = None) -> Path:
    """Local path of a remote input, downloading it on first use."""
    return fetch(url, filename=name, offline=offline, timeout=900).path


def _shift(a: np.ndarray, di: int, dj: int) -> np.ndarray:
    """``out[i, j] = a[i + di, j + dj]`` with edge replication."""
    ii = np.clip(np.arange(a.shape[0]) + di, 0, a.shape[0] - 1)
    jj = np.clip(np.arange(a.shape[1]) + dj, 0, a.shape[1] - 1)
    return a[np.ix_(ii, jj)]


def _block_mean(a: np.ndarray, k: int) -> np.ndarray:
    """Nan-aware mean of non-overlapping ``k x k`` blocks."""
    nrow, ncol = a.shape
    if nrow % k or ncol % k:
        raise BuildError(f"shape {a.shape} is not divisible by block {k}")
    finite = np.isfinite(a)
    total = np.where(finite, a, 0.0).reshape(nrow // k, k, ncol // k, k).sum(axis=(1, 3))
    count = finite.reshape(nrow // k, k, ncol // k, k).sum(axis=(1, 3))
    out = np.where(count > 0, total / np.maximum(count, 1), np.nan)
    return out.astype(np.float32)


def _nearest_fill(a: np.ndarray) -> np.ndarray:
    finite = np.isfinite(a)
    if finite.all() or not finite.any():
        return a
    _, index = distance_transform_edt(~finite, return_indices=True)
    return a[tuple(index)]


# --------------------------------------------------------------------------
# stage: terrain
# --------------------------------------------------------------------------


def _load_mercator_dem(offline: bool | None = None) -> np.ndarray:
    grid = np.empty((MERC_PX, MERC_PX), dtype=np.float32)
    for ty in range(TERRARIUM_TILES):
        for tx in range(TERRARIUM_TILES):
            url = f"{TERRARIUM_URL}/{TERRARIUM_ZOOM}/{tx}/{ty}.png"
            name = f"terrarium_{TERRARIUM_ZOOM}_{tx}_{ty}.png"
            last: Exception | None = None
            for attempt in range(3):
                try:
                    item = fetch(url, filename=name, offline=offline, timeout=120)
                    break
                except Exception as exc:  # any failure is retried below
                    last = exc
                    time.sleep(1.5 * (attempt + 1))
            else:
                raise BuildError(f"terrarium tile {tx}/{ty} unavailable: {last}")
            with Image.open(item.path) as image:
                rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
            if rgb.shape[:2] != (TERRARIUM_PX, TERRARIUM_PX):
                raise BuildError(f"{name} decoded to {rgb.shape}, expected square tile")
            y0, x0 = ty * TERRARIUM_PX, tx * TERRARIUM_PX
            grid[y0 : y0 + TERRARIUM_PX, x0 : x0 + TERRARIUM_PX] = terrain.decode_terrarium(rgb)
        _log(f"terrarium: row {ty + 1}/{TERRARIUM_TILES} decoded")
    return grid


def stage_terrain(force: bool = False, offline: bool | None = None) -> dict[str, np.ndarray]:
    cached = {key: _load(key, force) for key in ("elevation", "slope", "roughness")}
    if all(value is not None for value in cached.values()):
        return cached  # type: ignore[return-value]

    started = time.time()
    mercator = _load_mercator_dem(offline=offline)
    _log(f"terrarium: {MERC_PX}x{MERC_PX} grid assembled in {time.time() - started:.1f}s")

    dem = np.full((SROW, SCOL), np.nan, dtype=np.float32)
    reproject(
        mercator,
        dem,
        src_transform=MERC_TRANSFORM,
        src_crs="EPSG:3857",
        dst_transform=SUB_TRANSFORM,
        dst_crs=CRS,
        dst_nodata=np.nan,
        resampling=Resampling.bilinear,
    )
    del mercator

    land = landmask.fine_land(SROW, SCOL, offline=offline)
    dem[~land] = np.nan
    del land
    _log(f"terrain: fine DEM valid over {np.isfinite(dem).mean() * 100:.1f}% of the 1/12 deg grid")

    elevation = _block_mean(dem, BLOCK)
    _log("terrain: elevation block-mean done")

    slope = _slope_from_cell_field(elevation)
    _log("terrain: slope done")

    rough_fine = _fine_roughness(dem)
    del dem
    roughness = _block_mean(rough_fine, BLOCK)
    del rough_fine
    _log("terrain: roughness done")

    return {
        "elevation": _store("elevation", elevation),
        "slope": _store("slope", slope),
        "roughness": _store("roughness", roughness),
    }


def _slope_from_cell_field(elev: np.ndarray) -> np.ndarray:
    """Magnitude of the horizontal gradient of the 0.5 degree elevation field."""
    finite = np.isfinite(elev)
    filled = _nearest_fill(elev.astype(np.float64))
    dz_dlat = np.gradient(filled, CELL, axis=0) / M_PER_DEG_LAT
    dx_m = CELL * M_PER_DEG_LON * np.cos(np.deg2rad(LAT_CELL))
    dz_dlon = np.gradient(filled, CELL, axis=1) / np.maximum(dx_m, 1.0)[:, None]
    slope = np.degrees(np.arctan(np.hypot(dz_dlon, dz_dlat)))
    slope[~finite] = np.nan
    return slope.astype(np.float32)


def _fine_roughness(dem: np.ndarray, band: int = 360) -> np.ndarray:
    """RMS residual of the DEM about a least-squares plane over a 3x3 window."""
    out = np.full(dem.shape, np.nan, dtype=np.float32)
    nrow = dem.shape[0]
    gx_all = SUB_CELL * M_PER_DEG_LON * np.cos(np.deg2rad(LAT_SUB))
    gy = SUB_CELL * M_PER_DEG_LAT

    for start in range(0, nrow, band):
        stop = min(start + band, nrow)
        lo = max(0, start - 1)
        hi = min(nrow, stop + 1)

        valid = np.isfinite(dem[lo:hi])
        z = np.where(valid, dem[lo:hi], 0.0).astype(np.float64)
        z2 = z * z
        full = valid.copy()
        total = np.zeros_like(z)
        total2 = np.zeros_like(z)
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                full &= _shift(valid, di, dj)
                total += _shift(z, di, dj)
                total2 += _shift(z2, di, dj)
        del z2

        mean_z = total / 9.0
        variance = total2 / 9.0 - mean_z * mean_z
        del total, total2

        dx_pixel = (_shift(z, -1, 1) + _shift(z, 0, 1) + _shift(z, 1, 1)) - (
            _shift(z, -1, -1) + _shift(z, 0, -1) + _shift(z, 1, -1)
        )
        dy_pixel = (_shift(z, 1, -1) + _shift(z, 1, 0) + _shift(z, 1, 1)) - (
            _shift(z, -1, -1) + _shift(z, -1, 0) + _shift(z, -1, 1)
        )
        del z, valid

        gx = gx_all[lo:hi, None]
        b = dx_pixel / (6.0 * gx)
        c = dy_pixel / (6.0 * gy)
        explained = (2.0 / 3.0) * (b * b * gx * gx + c * c * gy * gy)
        del dx_pixel, dy_pixel, b, c

        rms = np.sqrt(np.clip(variance - explained, 0.0, None))
        del variance, explained
        rms[~full] = np.nan
        out[start:stop] = rms[start - lo : stop - lo].astype(np.float32)

    return out


# --------------------------------------------------------------------------
# stage: land
# --------------------------------------------------------------------------


def stage_land(force: bool = False, offline: bool | None = None) -> np.ndarray:
    cached = _load("land_fraction", force)
    if cached is not None:
        return cached
    fine = landmask.fine_land(SROW, SCOL, offline=offline)
    fraction = landmask.land_fraction(fine, BLOCK)
    kept = int((fraction >= LAND_FRACTION_MIN).sum())
    _log(f"land: {kept} cells with land fraction >= {LAND_FRACTION_MIN}")
    return _store("land_fraction", fraction)


# --------------------------------------------------------------------------
# stage: NASA POWER climatology
# --------------------------------------------------------------------------


def stage_power(force: bool = False, offline: bool | None = None) -> dict[str, np.ndarray]:
    names = (
        "precipitation",
        "annual_temperature_range",
        "mean_annual_temperature",
        "power_ts_range",
    )
    cached = {name: _load(name, force) for name in names}
    if all(value is not None for value in cached.values()):
        return cached  # type: ignore[return-value]

    corners = power.boxes_with_land(stage_land(offline=offline) > 0)
    started = time.time()
    rain = power.fetch_parameter("PRECTOTCORR", corners, ("ANN",), offline=offline)["ANN"]
    temps = power.fetch_parameter("T2M", corners, power.MONTHS, offline=offline)
    skin = power.fetch_parameter("TS_RANGE", corners, ("ANN",), offline=offline)["ANN"]

    monthly = np.stack([power.to_cell_grid(temps[m], LAT_CELL, LON_CELL) for m in power.MONTHS])
    complete = np.isfinite(monthly).all(axis=0)
    filled = np.where(np.isfinite(monthly), monthly, 0.0)
    annual_range = np.where(complete, filled.max(axis=0) - filled.min(axis=0), np.nan)
    mean_temperature = np.where(complete, filled.mean(axis=0), np.nan)
    precipitation = np.clip(power.to_cell_grid(rain, LAT_CELL, LON_CELL), 0.0, None)
    ts_range = power.to_cell_grid(skin, LAT_CELL, LON_CELL)
    _log(f"power: {len(corners)} boxes x 3 parameters in {time.time() - started:.1f}s")
    return {
        "precipitation": _store(
            "precipitation", (precipitation * DAYS_PER_YEAR).astype(np.float32)
        ),
        "annual_temperature_range": _store(
            "annual_temperature_range", annual_range.astype(np.float32)
        ),
        "mean_annual_temperature": _store(
            "mean_annual_temperature", mean_temperature.astype(np.float32)
        ),
        "power_ts_range": _store("power_ts_range", ts_range.astype(np.float32)),
    }


# --------------------------------------------------------------------------
# stage: land surface temperature
# --------------------------------------------------------------------------


def _warp_lst(path: Path) -> np.ndarray:
    with rasterio.open(path) as src:
        nodata = src.nodata
        if nodata is None:
            raise BuildError(f"{path.name} declares no nodata")
        out = np.full((NROW, NCOL), np.nan, dtype=np.float32)
        reproject(
            rasterio.band(src, 1),
            out,
            dst_transform=GRID_TRANSFORM,
            dst_crs=CRS,
            src_nodata=nodata,
            dst_nodata=np.nan,
            resampling=Resampling.average,
        )
    return out


def _modis_lst(force: bool, offline: bool | None) -> np.ndarray:
    cached = _load("lst_modis", force)
    if cached is not None:
        return cached
    day = _warp_lst(_raw(LST_DAY.name, f"{LST_RECORD}/{LST_DAY.name}/content", offline))
    night = _warp_lst(_raw(LST_NIGHT.name, f"{LST_RECORD}/{LST_NIGHT.name}/content", offline))
    span = (day - night) * LST_SCALE
    span[~np.isfinite(day) | ~np.isfinite(night)] = np.nan
    span[span <= 0] = np.nan
    return _store("lst_modis", span.astype(np.float32))


def stage_lst(force: bool = False, offline: bool | None = None) -> dict[str, np.ndarray]:
    cached = {name: _load(name, force) for name in ("lst_diurnal_range", "lst_source")}
    if all(value is not None for value in cached.values()):
        return cached  # type: ignore[return-value]

    modis = _modis_lst(force, offline)
    skin = stage_power(offline=offline)["power_ts_range"]
    land = stage_land(offline=offline) >= LAND_FRACTION_MIN

    both = land & np.isfinite(modis) & np.isfinite(skin)
    x = skin[both].astype(np.float64)
    y = modis[both].astype(np.float64)
    slope, intercept = np.polyfit(x, y, 1)
    corr = float(np.corrcoef(x, y)[0, 1])
    filled = np.clip(np.where(np.isfinite(modis), modis, slope * skin + intercept), 0.0, None)
    source = np.where(np.isfinite(modis), 1, np.where(np.isfinite(skin), 2, 0)).astype(np.uint8)
    fit = {
        "slope": round(float(slope), 4),
        "intercept": round(float(intercept), 4),
        "r": round(corr, 4),
        "n": int(both.sum()),
    }
    (DERIVED_DIR / "lst_fit.json").write_text(json.dumps(fit), encoding="utf-8")
    _log(
        f"lst: MODIS = {fit['slope']} x TS_RANGE + {fit['intercept']} (r = {fit['r']}); "
        f"gap-filled {int((land & (source == 2)).sum())} land cells"
    )
    return {
        "lst_diurnal_range": _store("lst_diurnal_range", filled.astype(np.float32)),
        "lst_source": _store("lst_source", source),
    }


# --------------------------------------------------------------------------
# stage: vegetation
# --------------------------------------------------------------------------


def stage_vegetation(force: bool = False, offline: bool | None = None) -> np.ndarray:
    cached = _load("vegetation", force)
    if cached is not None:
        return cached
    fine = gibs_ndvi.annual_max(offline=offline)
    return _store("vegetation", _block_mean(fine, BLOCK))


# --------------------------------------------------------------------------
# assemble
# --------------------------------------------------------------------------


SOURCES: list[dict[str, str]] = [
    {
        "dataset_id": landmask.DATASET_ID,
        "title": "Natural Earth 1:50m land minus 1:50m lakes (public domain)",
        "url": landmask.SOURCE_URL,
        "used_for": "candidate land mask",
    },
    {
        "dataset_id": "aws_terrain_tiles_terrarium",
        "title": "AWS Terrain Tiles (Terrarium, zoom 4): SRTM, GMTED and ETOPO1 composite",
        "url": "https://registry.opendata.aws/terrain-tiles/",
        "used_for": "elevation, slope, roughness",
    },
    {
        "dataset_id": power.DATASET_ID,
        "title": "NASA POWER climatology, MERRA-2 2001-2020 (PRECTOTCORR, T2M, TS_RANGE)",
        "url": power.SOURCE_URL,
        "used_for": "precipitation, annual and mean temperature, LST gap fill",
    },
    {
        "dataset_id": "zenodo_modis_lst_1km_2000_2020",
        "title": "Long-term MODIS Terra LST day-time and night-time, 1 km, 2000-2020",
        "url": "https://doi.org/10.5281/zenodo.6458406",
        "used_for": "LST diurnal range",
    },
    {
        "dataset_id": gibs_ndvi.DATASET_ID,
        "title": "NASA GIBS MODIS_Terra_L3_NDVI_Monthly (MOD13C2), 2023 annual maximum",
        "url": gibs_ndvi.SOURCE_URL,
        "used_for": "vegetation",
    },
]


def _report(stack: dict[str, np.ndarray], land: np.ndarray) -> None:
    mask = land >= LAND_FRACTION_MIN
    _log(f"candidate cells with land fraction >= {LAND_FRACTION_MIN}: {int(mask.sum())}")
    for key in CRITERIA:
        values = stack[key][mask]
        values = values[np.isfinite(values)]
        if values.size == 0:
            _log(f"  {key}: no finite values")
            continue
        q = np.percentile(values, [0.5, 50, 99.5])
        _log(
            f"  {key:26s} n={values.size:6d} min={values.min():9.3f} p0.5={q[0]:9.3f} "
            f"p50={q[1]:9.3f} p99.5={q[2]:9.3f} max={values.max():9.3f}"
        )


def _write(root: zarr.Group, name: str, values: np.ndarray, dtype: str, fill: float) -> None:
    root.create_array(name, shape=values.shape, dtype=dtype, chunks=values.shape, fill_value=fill)
    root[name][:] = values


def assemble() -> None:
    norm = json.loads(NORM_PATH.read_text(encoding="utf-8"))
    land = _load("land_fraction", False)
    lst_source = _load("lst_source", False)
    if land is None or lst_source is None:
        raise BuildError("the land and lst stages must be built before assemble")
    keep = land >= LAND_FRACTION_MIN

    stack: dict[str, np.ndarray] = {}
    for key in CRITERIA:
        values = _load(key, False)
        if values is None:
            raise BuildError(f"{key} must be built before assemble")
        values = np.asarray(values, dtype=np.float32)
        values[~keep] = np.nan
        stack[key] = values

    _report(stack, land)

    if STACK_PATH.exists():
        shutil.rmtree(STACK_PATH)

    root = zarr.open_group(str(STACK_PATH), mode="w")
    for key in CRITERIA:
        _write(root, key, stack[key], "f4", np.nan)
    _write(root, "lat", LAT_CELL.astype(np.float32), "f4", np.nan)
    _write(root, "lon", LON_CELL.astype(np.float32), "f4", np.nan)
    _write(root, "land_fraction", np.asarray(land, dtype=np.float32), "f4", 0.0)
    _write(root, "lst_source", np.where(keep, lst_source, 0).astype(np.uint8), "u1", 0)

    fit_path = DERIVED_DIR / "lst_fit.json"
    root.attrs["schema_version"] = "2.0"
    root.attrs["created_utc"] = utc_now_iso()
    root.attrs["normalization"] = norm["criteria"]
    root.attrs["weights"] = norm["weights"]
    root.attrs["grid"] = {
        "crs": CRS,
        "shape": [NROW, NCOL],
        "cell_degrees": CELL,
        "row0_centre_latitude": float(LAT_CELL[0]),
        "column0_centre_longitude": float(LON_CELL[0]),
        "ordering": "row-major, north to south then west to east",
    }
    root.attrs["land_rule"] = (
        f"A cell is a candidate when at least {LAND_FRACTION_MIN:.0%} of its 1/12 degree "
        "pixels fall inside Natural Earth 1:50m land and outside 1:50m lakes."
    )
    root.attrs["lst_source_codes"] = {"1": "MODIS LST", "2": "NASA POWER TS_RANGE fit"}
    if fit_path.exists():
        root.attrs["lst_fit"] = json.loads(fit_path.read_text(encoding="utf-8"))
    root.attrs["sources"] = SOURCES
    _log(f"wrote {STACK_PATH.relative_to(REPO_ROOT)}")


STAGES = ("land", "dem", "power", "lst", "vegetation", "assemble")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", choices=("all", *STAGES), default="all")
    parser.add_argument("--force", action="store_true", help="ignore cache/derived")
    parser.add_argument("--offline", action="store_true", help="never touch the network")
    args = parser.parse_args(argv)
    offline: bool | None = True if args.offline else None

    runners = {
        "land": lambda: stage_land(args.force, offline),
        "dem": lambda: stage_terrain(args.force, offline),
        "power": lambda: stage_power(args.force, offline),
        "lst": lambda: stage_lst(args.force, offline),
        "vegetation": lambda: stage_vegetation(args.force, offline),
        "assemble": assemble,
    }
    for stage in STAGES if args.stage == "all" else (args.stage,):
        started = time.time()
        runners[stage]()
        _log(f"stage {stage} finished in {time.time() - started:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
