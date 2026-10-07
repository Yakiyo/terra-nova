"""HTTP API for the Earth-analogue finder.

Run with::

    uvicorn src.api.main:app --reload

Every endpoint is a thin wrapper over :mod:`src.compute.similarity`,
:mod:`src.compute.validation` and the deterministic explainer in
:mod:`src.agents.rationale`; nothing here calls a model or the network. Score
surfaces and predictor grids are transferred as base64-encoded little-endian
float32 so the browser can decode them into a ``Float32Array`` without a parser.
"""

from __future__ import annotations

import base64
import json
import math
import os
import re
import threading
from contextlib import asynccontextmanager
from typing import Any

import numpy as np
import zarr
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles

from src.acquire import peek, sitetiles, thumbs, tiles
from src.acquire.download import REPO_ROOT, FetchError, offline_mode
from src.agents.rationale import explain_cell, load_targets
from src.compute import countries, datachecks, robustness, terrain, validation
from src.compute.gazetteer import Gazetteer, default_gazetteer
from src.compute.similarity import (
    CRITERIA,
    DEFAULT_WEIGHTS,
    CriterionRange,
    SimilarityError,
    SimilarityResult,
    compute_similarity,
    load_normalization,
    normalize_weights_report,
    rank_top,
    valid_mask,
)

STACK_PATH = REPO_ROOT / "cache" / "predictors.zarr"
NORM_PATH = REPO_ROOT / "data" / "normalization.json"
WEB_PATH = REPO_ROOT / "web"
LST_SOURCES = {0: None, 1: "MODIS LST", 2: "NASA POWER TS_RANGE fit"}
BASEMAPS = {
    "earth": {
        "credit": "NASA Blue Marble (shaded relief and bathymetry) via NASA GIBS",
        "url": "https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/",
    },
    "moon": {
        "credit": "NASA Moon Trek, LRO WAC Global Mosaic",
        "url": "https://trek.nasa.gov/moon/",
    },
    "mars": {
        "credit": "NASA Mars Trek, Viking MDIM 2.1 Colour Mosaic",
        "url": "https://trek.nasa.gov/mars/",
    },
}


def _predictor_sources() -> dict[str, dict[str, str]]:
    """dataset_id and source_url for every criterion, from data/normalization.json."""
    raw = json.loads(NORM_PATH.read_text(encoding="utf-8"))["criteria"]
    return {
        key: {"dataset_id": raw[key]["source_dataset_id"], "source_url": raw[key]["source_url"]}
        for key in CRITERIA
    }


SOURCES = _predictor_sources()


@asynccontextmanager
async def _lifespan(_: FastAPI):  # type: ignore[no-untyped-def]
    """Warm the robustness cache for every target under the interface defaults, in a
    background thread, so the first stability badges appear without a delay."""

    def warm() -> None:
        try:
            for target_id in _targets():
                robustness_report(ScoreRequest(target_id=target_id, **UI_DEFAULTS))
        except Exception:  # warming is best effort
            pass

    # EAF_WARM=0 skips this on slow machines (the badges then compute on first use).
    if os.environ.get("EAF_WARM", "1") != "0":
        threading.Thread(target=warm, daemon=True).start()
    yield


# The ranking settings the web interface starts with (web/app.js scoreRequest).
UI_DEFAULTS: dict[str, Any] = {
    "top_k": 20,
    "min_separation_cells": 3,
    "new_only": True,
    "min_distance_km": 800.0,
    "max_per_country": 2,
    "tolerance": 0.0,
}

app = FastAPI(
    lifespan=_lifespan,
    title="TerraNova",
    version="2.0.0",
    description=(
        "Deterministic multi-criteria similarity between Moon and Mars base-site "
        "targets and Earth's land surface, scored on a 0.5 degree grid."
    ),
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ScoreRequest(BaseModel):
    """Body for :func:`score`."""

    target_id: str | None = Field(
        default=None, description="Key into data/targets.json; ignored when criteria is given."
    )
    criteria: dict[str, float | None] | None = Field(
        default=None,
        description="Explicit target profile overriding target_id; null = criterion not used.",
    )
    body: str | None = Field(
        default=None, description="Moon or Mars, for validating a custom profile."
    )
    weights: dict[str, float] | None = Field(default=None, description="Per-criterion weights.")
    top_k: int = Field(default=20, ge=1, le=500)
    min_separation_cells: int = Field(
        default=2, ge=0, le=20, description="Suppress near-duplicate winners."
    )
    include_field: bool = Field(
        default=False, description="Also return the whole score surface (base64 float32)."
    )
    tolerance: float = Field(
        default=0.0,
        ge=0.0,
        le=3.0,
        description=(
            "Permissible error: multiplies each criterion's confidence-based error "
            "(robustness.NOISE x range) into a full-match band. 0 = exact targets."
        ),
    )
    new_only: bool = Field(
        default=False, description="Rank only cells more than 500 km from any known analog."
    )
    max_per_country: int = Field(
        default=0, ge=0, le=20, description="At most this many results per country (0 = no cap)."
    )
    min_distance_km: float = Field(
        default=0.0, ge=0.0, le=5000.0, description="Minimum great-circle distance between results."
    )


class _State:
    """Lazily loaded, process-wide read-only cache."""

    def __init__(self) -> None:
        self.stack: dict[str, np.ndarray] | None = None
        self.lst_source: np.ndarray | None = None
        self.attrs: dict[str, Any] = {}
        self.ranges: dict[str, CriterionRange] | None = None
        self.targets: dict[str, dict[str, Any]] | None = None
        self.catalog: dict[str, Any] | None = None
        self.gazetteer: Gazetteer | None = None

    def load(self) -> None:
        if self.stack is not None:
            return
        if not STACK_PATH.exists():
            raise HTTPException(
                status_code=503,
                detail=(
                    f"{STACK_PATH.relative_to(REPO_ROOT)} is missing. "
                    "Run `python -m src.acquire.build_predictor_stack` first."
                ),
            )
        root = zarr.open_group(str(STACK_PATH), mode="r")
        self.stack = {key: np.asarray(root[key][:], dtype=np.float64) for key in CRITERIA}
        self.lst_source = np.asarray(root["lst_source"][:]) if "lst_source" in root else None
        self.attrs = dict(root.attrs)
        self.ranges = load_normalization()
        self.targets = load_targets(ranges=self.ranges)
        self.catalog = validation.load_catalog()
        try:
            self.gazetteer = default_gazetteer(offline=offline_mode())
        except Exception:  # any failure simply disables labels
            self.gazetteer = None

    @property
    def arrays(self) -> dict[str, np.ndarray]:
        self.load()
        assert self.stack is not None
        return self.stack


STATE = _State()


def _ranges() -> dict[str, CriterionRange]:
    STATE.load()
    assert STATE.ranges is not None
    return STATE.ranges


def _targets() -> dict[str, dict[str, Any]]:
    STATE.load()
    assert STATE.targets is not None
    return STATE.targets


def _catalog() -> dict[str, Any]:
    STATE.load()
    assert STATE.catalog is not None
    return STATE.catalog


def _encode(values: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(values, dtype="<f4").tobytes()).decode("ascii")


def _field(values: np.ndarray) -> dict[str, Any]:
    finite = values[np.isfinite(values)]
    return {
        "shape": list(values.shape),
        "encoding": "float32-le-base64",
        "min": float(finite.min()) if finite.size else None,
        "max": float(finite.max()) if finite.size else None,
        "data": _encode(values),
    }


def _cell_centre(row: int, col: int) -> tuple[float, float]:
    return 90.0 - (row + 0.5) * 0.5, -179.75 + col * 0.5


def _target_profile(request: ScoreRequest) -> tuple[dict[str, float | None], str | None]:
    if request.criteria is not None:
        missing = [key for key in CRITERIA if key not in request.criteria]
        if missing:
            raise HTTPException(status_code=422, detail=f"criteria missing {missing}")
        unknown = set(request.criteria) - set(CRITERIA)
        if unknown:
            raise HTTPException(status_code=422, detail=f"unknown criteria {sorted(unknown)}")
        return {key: _optional(request.criteria[key]) for key in CRITERIA}, None
    if not request.target_id:
        raise HTTPException(status_code=422, detail="provide target_id or criteria")
    targets = _targets()
    if request.target_id not in targets:
        raise HTTPException(status_code=404, detail=f"unknown target {request.target_id!r}")
    entry = targets[request.target_id]
    profile = {key: _optional(entry["criteria"][key]["value"]) for key in CRITERIA}
    return profile, request.target_id


def _custom_entry(profile: dict[str, float]) -> dict[str, Any]:
    """Synthetic target record so custom profiles still get a provenance-backed rationale."""
    return {
        "id": "__custom__",
        "name": "Custom profile",
        "short_name": "the custom profile",
        "body": "user supplied",
        "criteria": {
            key: {
                "value": profile[key],
                "dataset_id": "user_entered",
                "source_url": SOURCES[key]["source_url"],
                "confidence": "high",
                "definition_note": "",
                "unit": "",
            }
            for key in CRITERIA
        },
        "units_note": (
            "Custom profile set by the user. Treat the ranking as a screening tool, "
            "not a site survey."
        ),
        "source_url": "",
    }


def _country_of(lat: float, lon: float) -> str | None:
    """Country whose borders contain the cell (Natural Earth admin-0), if any."""
    try:
        return countries.country_at(lat, lon, offline=offline_mode())
    except Exception:  # boundary file unavailable: fall back to the nearest place
        return None


def _label_for(lat: float, lon: float) -> dict[str, Any]:
    if STATE.gazetteer is None:
        return {"text": f"{lat:.2f}, {lon:.2f}", "kind": "coordinates", "source": "grid"}
    label = STATE.gazetteer.label(lat, lon).as_dict()
    # The nearest town can be across a border; the polygon test is authoritative.
    country = _country_of(lat, lon)
    if country:
        label["country"] = country
    return label


def _target_weights(target_id: str | None) -> dict[str, float]:
    """Global defaults overlaid with the target's own default weights."""
    weights = dict(DEFAULT_WEIGHTS)
    if target_id:
        weights.update(_targets()[target_id].get("weights", {}))
    return weights


def _tolerances(request: ScoreRequest, target_id: str | None) -> dict[str, float]:
    """Full-match band per criterion: permissible-error x confidence noise x range."""
    if request.tolerance <= 0:
        return {}
    ranges = _ranges()
    criteria = _targets()[target_id]["criteria"] if target_id else {}
    out = {}
    for key in CRITERIA:
        confidence = str(criteria.get(key, {}).get("confidence", "medium"))
        noise = robustness.NOISE.get(confidence, robustness.NOISE["medium"])
        out[key] = request.tolerance * noise * ranges[key].span
    return out


def _score(
    request: ScoreRequest,
) -> tuple[SimilarityResult, dict[str, float | None], str | None]:
    profile, target_id = _target_profile(request)
    weights = {**_target_weights(target_id), **(request.weights or {})}
    try:
        result = compute_similarity(
            STATE.arrays, profile, weights, _ranges(), _tolerances(request, target_id)
        )
    except SimilarityError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return result, profile, target_id


_NOVELTY_KM: list[np.ndarray] = []


def _novelty_km() -> np.ndarray:
    """Cached distance from each cell to the nearest known-analog footprint."""
    if not _NOVELTY_KM:
        _NOVELTY_KM.append(validation.distance_grid(_catalog()))
    return _NOVELTY_KM[0]


def _shortfall(request: ScoreRequest, returned: int) -> str | None:
    """Why fewer sites came back than were asked for, if they did."""
    if returned >= request.top_k:
        return None
    limits = []
    if request.new_only:
        limits.append("new sites only")
    if request.min_distance_km:
        limits.append(f"at least {request.min_distance_km:.0f} km apart")
    if request.max_per_country:
        limits.append(f"at most {request.max_per_country} per country")
    rule = ", ".join(limits) if limits else "the minimum separation"
    return f"Only {returned} of {request.top_k} requested sites meet these rules: {rule}."


def _country_key(lat: float, lon: float) -> str:
    """Key for the per-country cap: the country containing the cell."""
    country = _country_of(lat, lon)
    if country:
        return country
    label = _label_for(lat, lon)
    return str(label.get("country") or label.get("region") or "unknown")


def _rank(result: SimilarityResult, mask: np.ndarray, request: ScoreRequest) -> list[int]:
    """Ranked cell indices with the request's separation, novelty and region rules."""
    if not request.new_only and not request.max_per_country and not request.min_distance_km:
        return rank_top(
            result.score, mask, k=request.top_k, min_separation_cells=request.min_separation_cells
        )
    values = np.where(mask, result.score, -np.inf).ravel()
    order = np.argsort(-values, kind="stable")
    width = result.score.shape[1]
    sep = request.min_separation_cells
    chosen: list[int] = []
    per_region: dict[str, int] = {}
    for scanned, index in enumerate(order):
        if len(chosen) >= request.top_k or scanned > 60000 or not np.isfinite(values[index]):
            break
        row, col = divmod(int(index), width)
        if any(
            abs(row - r) <= sep and abs(col - c) <= sep
            for r, c in (divmod(i, width) for i in chosen)
        ):
            continue
        lat, lon = _cell_centre(row, col)
        if request.min_distance_km and any(
            validation.haversine_km(lat, lon, *_cell_centre(*divmod(i, width)))
            < request.min_distance_km
            for i in chosen
        ):
            continue
        if request.new_only and _novelty_km()[row, col] <= validation.NEAR_KM:
            continue
        if request.max_per_country:
            region = _country_key(lat, lon)
            if per_region.get(region, 0) >= request.max_per_country:
                continue
            per_region[region] = per_region.get(region, 0) + 1
        chosen.append(int(index))
    return chosen


def _lst_source(row: int, col: int) -> str | None:
    if STATE.lst_source is None:
        return None
    return LST_SOURCES.get(int(STATE.lst_source[row, col]))


def _explain_context(
    request: ScoreRequest, profile: dict[str, float], target_id: str | None
) -> tuple[dict[str, Any], str, dict[str, Any], str]:
    """Target record, explainer id/catalogue and body for a scoring request."""
    if target_id:
        catalogue = _targets()
        entry = catalogue[target_id]
        return entry, target_id, catalogue, str(entry["body"])
    entry = _custom_entry(profile)
    return entry, "__custom__", {"__custom__": entry}, request.body or ""


def _result_row(
    result: SimilarityResult,
    rank: int | None,
    index: int,
    entry: dict[str, Any],
    explain_id: str,
    explain_targets: dict[str, Any],
    finite_sorted: np.ndarray,
) -> dict[str, Any]:
    """Everything the interface shows about one scored cell."""
    stack = STATE.arrays
    shape = result.score.shape
    row, col = divmod(index, shape[1])
    lat, lon = _cell_centre(row, col)
    label = _label_for(lat, lon)
    value = float(result.score[row, col])
    rationale = explain_cell(
        result, stack, explain_id, index, None, grid_shape=shape, targets=explain_targets
    ).as_dict()
    rationale["headline"] = (
        f"Scores {value:.0%} against {entry['short_name']} ({entry['body']}) - {label['text']}."
    )
    percentile = 100.0 * np.searchsorted(finite_sorted, value, side="left") / finite_sorted.size
    return {
        "rank": rank,
        "index": index,
        "row": row,
        "col": col,
        "lat": round(lat, 3),
        "lon": round(lon, 3),
        "score": round(value, 6),
        "percentile": round(float(percentile), 2),
        "label": label,
        "novelty": validation.novelty(lat, lon, _catalog()),
        "values": {key: _round(stack[key][row, col]) for key in CRITERIA},
        "similarities": {key: _round(result.similarities[key][row, col]) for key in CRITERIA},
        "lst_source": _lst_source(row, col),
        "rationale": rationale,
    }


# --------------------------------------------------------------------------
# endpoints
# --------------------------------------------------------------------------


@app.get("/api/health")
def health() -> dict[str, Any]:
    """Readiness probe: stack present, offline flag, grid shape."""
    try:
        stack = STATE.arrays
    except HTTPException as exc:
        return {"ok": False, "detail": exc.detail}
    mask = valid_mask(stack)
    return {
        "ok": True,
        "offline": offline_mode(),
        "shape": list(next(iter(stack.values())).shape),
        "candidate_cells": int(mask.sum()),
        "criteria": list(CRITERIA),
        "gazetteer": STATE.gazetteer is not None,
        "built_utc": STATE.attrs.get("created_utc"),
    }


@app.get("/api/criteria")
def criteria() -> dict[str, Any]:
    """Normalisation ranges, Earth envelope, units and the default weight shares."""
    ranges = _ranges()
    return {
        "criteria": [
            {
                "key": key,
                "label": ranges[key].label,
                "unit": ranges[key].unit,
                "description": ranges[key].description,
                "min": ranges[key].min,
                "max": ranges[key].max,
                "earth_min": ranges[key].earth_min,
                "earth_max": ranges[key].earth_max,
                **SOURCES[key],
            }
            for key in CRITERIA
        ],
        "weights": normalize_weights_report(ranges=ranges),
    }


@app.get("/api/targets")
def targets() -> dict[str, Any]:
    """The extraterrestrial base-site target profiles, with Earth-effective values."""
    ranges = _ranges()
    out = []
    for entry in _targets().values():
        criteria_out = {}
        for key, meta in entry["criteria"].items():
            value = _optional(meta["value"])
            criteria_out[key] = {
                **meta,
                "effective_value": (
                    None if value is None else round(ranges[key].effective_target(value), 4)
                ),
            }
        out.append(
            {
                "id": entry["id"],
                "name": entry["name"],
                "short_name": entry["short_name"],
                "body": entry["body"],
                "latitude": entry["latitude"],
                "longitude": entry["longitude"],
                "summary": entry["summary"],
                "source_url": entry["source_url"],
                "source_label": entry.get("source_label"),
                "trek_url": entry.get("trek_url"),
                "group": entry.get("group", entry["body"]),
                "location_note": entry.get("location_note"),
                "validation_tag": entry.get("validation_tag"),
                "default_weights": _target_weights(entry["id"]),
                "criteria": criteria_out,
            }
        )
    return {"targets": out}


@app.post("/api/score")
def score(request: ScoreRequest) -> dict[str, Any]:
    """Score every land cell against a target profile and rank the winners."""
    stack = STATE.arrays
    result, profile, target_id = _score(request)

    mask = valid_mask(stack)
    indices = _rank(result, mask, request)
    if not indices:
        raise HTTPException(status_code=404, detail="no scorable cells")

    entry, explain_id, explain_targets, body = _explain_context(request, profile, target_id)
    finite = np.sort(result.score[mask & np.isfinite(result.score)])
    results = [
        _result_row(result, rank, int(index), entry, explain_id, explain_targets, finite)
        for rank, index in enumerate(indices, start=1)
    ]

    payload: dict[str, Any] = {
        "target_id": target_id,
        "profile": profile,
        "effective_profile": {key: _optional(result.effective_target[key]) for key in CRITERIA},
        "weights": {key: result.weights[key] for key in CRITERIA},
        "score_range": [round(float(finite.min()), 6), round(float(finite.max()), 6)],
        "results": results,
        "requested": request.top_k,
        "shortfall": _shortfall(request, len(results)),
        "filters": {
            "tolerance": request.tolerance,
            "new_only": request.new_only,
            "max_per_country": request.max_per_country,
            "min_distance_km": request.min_distance_km,
            "min_separation_cells": request.min_separation_cells,
        },
        "validation": (
            validation.validate(result.score, body, _catalog(), _validation_tag(target_id))
            if body
            else None
        ),
    }
    if request.include_field:
        payload["field"] = _field(result.score)
    return payload


_ROBUSTNESS_CACHE: dict[str, dict[str, Any]] = {}


@app.post("/api/robustness")
def robustness_report(request: ScoreRequest) -> dict[str, Any]:
    """Uncertainty (Monte Carlo stability of the ranked sites) and sensitivity
    (validation with each criterion left out). Deterministic; cached per request."""
    key = request.model_dump_json(exclude={"include_field"})
    if key in _ROBUSTNESS_CACHE:
        return _ROBUSTNESS_CACHE[key]
    stack = STATE.arrays
    result, profile, target_id = _score(request)
    mask = valid_mask(stack)
    indices = _rank(result, mask, request)
    entry, _, _, body = _explain_context(request, profile, target_id)
    confidence = {k: str(entry["criteria"][k].get("confidence", "medium")) for k in CRITERIA}
    weights = dict(result.weights)
    mc = robustness.stability(
        stack, profile, confidence, weights, _ranges(), indices, _tolerances(request, target_id)
    )
    sens = []
    if body:
        for row in robustness.sensitivity(
            stack, profile, weights, _ranges(), body, _validation_tag(target_id), mask, _catalog()
        ):
            top = row["top_index"]
            lat, lon = (
                _cell_centre(*divmod(top, result.score.shape[1]))
                if top is not None
                else (None, None)
            )
            sens.append(
                {
                    "without": row["without"],
                    "label": _ranges()[row["without"]].label,
                    "auc": row["auc"],
                    "top_site": _label_for(lat, lon)["text"] if lat is not None else None,
                    "top_unchanged": top == (indices[0] if indices else None),
                }
            )
    payload = {
        "method": robustness.__doc__.strip(),
        "stability": {str(i): s for i, s in zip(indices, mc["stability"], strict=True)},
        "runs": mc["runs"],
        "seed": mc["seed"],
        "noise": mc["noise"],
        "top_share": mc["top_share"],
        "sensitivity": sens,
    }
    if len(_ROBUSTNESS_CACHE) > 64:
        _ROBUSTNESS_CACHE.clear()
    _ROBUSTNESS_CACHE[key] = payload
    return payload


_DATACHECKS: list[dict[str, Any]] = []


@app.get("/api/datachecks")
def data_checks() -> dict[str, Any]:
    """Do independent datasets agree where physics says they must? (Spearman rho)"""
    if not _DATACHECKS:
        derived = REPO_ROOT / "cache" / "derived"
        arrays = {
            name: np.load(derived / f"{name}.npy").astype(np.float64)
            for name in ("lst_modis", "power_ts_range")
        }
        arrays.update({key: STATE.arrays[key] for key in CRITERIA})
        lat = 90.0 - (np.arange(360) + 0.5) * 0.5
        arrays["abs_latitude"] = np.repeat(np.abs(lat)[:, None], 720, axis=1)
        land = np.load(derived / "land_fraction.npy") >= 0.5
        _DATACHECKS.extend(datachecks.run(arrays, land))
    return {"method": datachecks.__doc__.strip(), "checks": _DATACHECKS}


@app.post("/api/explain")
def explain(
    request: ScoreRequest,
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
) -> dict[str, Any]:
    """The full breakdown for any clicked location, same shape as a ranked result."""
    stack = STATE.arrays
    result, profile, target_id = _score(request)
    row = min(max(int((90.0 - lat) // 0.5), 0), 359)
    col = min(max(int((lon + 180.0) // 0.5), 0), 719)
    if not np.isfinite(result.score[row, col]):
        clat, clon = _cell_centre(row, col)
        return {
            "scored": False,
            "lat": round(clat, 3),
            "lon": round(clon, 3),
            "label": _label_for(clat, clon),
            "values": {key: _round(stack[key][row, col]) for key in CRITERIA},
            "reason": "Not a candidate cell: under 50% land, or a predictor has no data here.",
        }
    entry, explain_id, explain_targets, _ = _explain_context(request, profile, target_id)
    mask = valid_mask(stack)
    finite = np.sort(result.score[mask & np.isfinite(result.score)])
    row_out = _result_row(
        result, None, row * result.score.shape[1] + col, entry, explain_id, explain_targets, finite
    )
    return {"scored": True, **row_out}


@app.get("/api/thumb")
def thumb(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
) -> FileResponse:
    """Cloud-free NASA Blue Marble preview (2 x 2 degrees) of the cell at lat/lon.

    Served from cache/thumbs; fetched from NASA GIBS on a miss unless OFFLINE=1,
    in which case a miss is a 404 and the interface falls back to its own basemap.
    """
    try:
        path = thumbs.thumbnail(lat, lon, offline=offline_mode())
    except FetchError as exc:
        raise HTTPException(status_code=404, detail="no cached preview for this cell") from exc
    clat, clon = thumbs.cell_centre(lat, lon)
    s, w, n, e = thumbs.bbox(clat, clon)
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Bbox": f"{s},{w},{n},{e}",
            "X-Credit": thumbs.CREDIT,
        },
    )


@app.get("/api/tile/{z}/{row}/{col}.jpg")
def tile(z: int, row: int, col: int) -> FileResponse:
    """Detail imagery tile (see src/acquire/tiles.py); 404 when offline and not cached."""
    try:
        path = tiles.tile(z, row, col, offline=offline_mode())
    except tiles.TileError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FetchError as exc:
        raise HTTPException(status_code=404, detail="tile not cached") from exc
    return FileResponse(
        path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"}
    )


@app.get("/api/site3d")
def site3d(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
    target_id: str | None = Query(default=None),
) -> dict[str, Any]:
    """Terrain around a site for the God's Eye view, plus local terrain statistics.

    Elevation comes from AWS Terrain Tiles at zoom 10 (~150 m/px at the equator):
    a 1024 x 1024 mosaic around the site. Statistics are computed for the whole
    mosaic and for the 0.5 degree grid cell that was scored.
    """
    clat, clon = thumbs.cell_centre(lat, lon)
    try:
        # Centre the mosaic on the scored cell, so the whole cell is in view.
        x0, y0 = sitetiles.mosaic_origin(clat, clon)
        dem = sitetiles.dem_mosaic(x0, y0, offline=offline_mode())
    except sitetiles.SiteTileError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FetchError as exc:
        if offline_mode():
            raise HTTPException(
                status_code=404,
                detail="Terrain for this site is not cached, and the app is in offline mode. "
                "Prefetch it (python -m src.acquire.sitetiles) or copy cache/sitetiles "
                "from a prepared laptop.",
            ) from exc
        raise HTTPException(
            status_code=504,
            detail="Could not download the terrain tiles in time (the network is slow or "
            "blocks s3.amazonaws.com). Run: python -m scripts.check_network",
        ) from exc

    z, size = sitetiles.DEM_ZOOM, dem.shape[0]
    px = np.arange(size) + 0.5
    row_lat = np.array([terrain.tile_to_lat(y0 + v / 256.0, z) for v in px])
    col_lon = np.array([terrain.tile_to_lon(x0 + u / 256.0, z) for u in px])
    slope = terrain.slope_degrees(dem, row_lat, z)

    south, north, west, east = clat - 0.25, clat + 0.25, clon - 0.25, clon + 0.25
    cell = terrain.cell_mask(row_lat, col_lon, south, west, north, east)
    area_stats = terrain.stats(dem, slope)
    cell_stats = terrain.stats(dem, slope, cell) if cell.any() else None

    def frac(la: float, lo: float) -> list[float]:
        fx, fy = terrain.lonlat_to_tile(la, lo, z)
        return [round((fx - x0) / sitetiles.MOSAIC, 5), round((fy - y0) / sitetiles.MOSAIC, 5)]

    centre_lat = float(row_lat[size // 2])
    metres = float(terrain.pixel_size_m(z, np.array([centre_lat]))[0])
    target_slope = None
    if target_id and target_id in _targets():
        meta = _targets()[target_id]["criteria"].get("slope", {})
        target_slope = {
            "measured_value": meta.get("measured_value", meta.get("value")),
            "baseline": meta.get("baseline"),
            "source_url": meta.get("source_url"),
            "body": _targets()[target_id]["body"],
        }
    img = sitetiles.IMAGERY["s2"]
    factor = 2 ** (img["zoom"] - z)
    return {
        "lat": lat,
        "lon": lon,
        "label": _label_for(clat, clon),
        "bounds": {
            "north": round(float(terrain.tile_to_lat(y0, z)), 5),
            "south": round(float(terrain.tile_to_lat(y0 + sitetiles.MOSAIC, z)), 5),
            "west": round(float(terrain.tile_to_lon(x0, z)), 5),
            "east": round(float(terrain.tile_to_lon(x0 + sitetiles.MOSAIC, z)), 5),
        },
        "ground_size_m": round(metres * size, 1),
        "pixel_m": round(metres, 2),
        "site": frac(lat, lon),
        "cell": {"nw": frac(north, west), "se": frac(south, east)},
        "heightmap": {
            "shape": [size // 4, size // 4],
            "encoding": "float32-le-base64",
            "data": _encode(terrain.block_mean(dem, 4)),
        },
        "stats": {
            "area": area_stats.as_dict(),
            "cell": cell_stats.as_dict() if cell_stats else None,
            "slope_baseline_m": round(metres, 1),
            "trafficable_deg": terrain.TRAFFICABLE_DEG,
        },
        "target_slope": target_slope,
        "imagery": {
            "s2": {
                "zoom": img["zoom"],
                "x0": x0 * factor,
                "y0": y0 * factor,
                "tiles": sitetiles.MOSAIC * factor,
                "credit": img["credit"],
                "licence": img["licence"],
            }
        },
        "credits": {"elevation": sitetiles.DEM_CREDIT, "imagery": img["credit"]},
    }


@app.get("/api/peek")
def peek_info(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
) -> dict[str, Any]:
    """Relief-shaded Sentinel-2 preview of a cell plus a 64 x 64 heightmap for a 3D card."""
    clat, clon = thumbs.cell_centre(lat, lon)
    if abs(clat) > terrain.MAX_MERCATOR_LAT - 1.5:
        raise HTTPException(status_code=422, detail="no elevation tiles this close to the pole")
    try:
        info = peek.build(clat, clon, offline=offline_mode())
    except FetchError as exc:
        raise HTTPException(status_code=404, detail="preview not cached (offline)") from exc
    return {**info, "image_url": f"/api/peek.jpg?lat={clat}&lon={clon}"}


@app.get("/api/peek.jpg")
def peek_image(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
) -> FileResponse:
    clat, clon = thumbs.cell_centre(lat, lon)
    path = peek.image_path(clat, clon)
    if not path.exists():
        if abs(clat) > terrain.MAX_MERCATOR_LAT - 1.5:
            raise HTTPException(status_code=422, detail="no elevation tiles this close to the pole")
        try:
            peek.build(clat, clon, offline=offline_mode())
        except FetchError as exc:
            raise HTTPException(status_code=404, detail="preview not cached (offline)") from exc
    return FileResponse(
        path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"}
    )


@app.get("/api/imagery/{source}/{z}/{x}/{y}.jpg")
def imagery(source: str, z: int, x: int, y: int) -> FileResponse:
    """Cached imagery tile for the God's Eye view; 404 when offline and not cached."""
    try:
        path = sitetiles.imagery_tile(source, z, x, y, offline=offline_mode())
    except sitetiles.SiteTileError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FetchError as exc:
        raise HTTPException(status_code=404, detail="imagery tile not cached") from exc
    return FileResponse(
        path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"}
    )


_COORDS = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$")


@app.get("/api/search")
def search(q: str = Query(..., min_length=1, max_length=80)) -> dict[str, Any]:
    """Find a place: known analogs, named regions, towns, or 'lat, lon'."""
    STATE.load()
    match = _COORDS.match(q)
    if match:
        lat, lon = float(match.group(1)), float(match.group(2))
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            return {
                "results": [
                    {
                        "name": f"{lat:.3f}, {lon:.3f}",
                        "kind": "coordinates",
                        "lat": lat,
                        "lon": lon,
                        "detail": "typed coordinates",
                    }
                ]
            }
        return {"results": []}
    needle = q.strip().lower()
    found: list[tuple[int, float, dict[str, Any]]] = []

    def consider(name: str, kind: str, lat: float, lon: float, detail: str, weight: float) -> None:
        low = name.lower()
        if needle not in low:
            return
        rank = 0 if low.startswith(needle) else 1
        found.append(
            (rank, -weight, {"name": name, "kind": kind, "lat": lat, "lon": lon, "detail": detail})
        )

    for site in _catalog()["sites"]:
        consider(site["name"], "known analog", site["lat"], site["lon"], site["use"], 1e12)
    if STATE.gazetteer is not None:
        for region in STATE.gazetteer.regions:
            consider(region.name, region.kind, region.lat, region.lon, "region", 1e11)
        for place in STATE.gazetteer.places:
            consider(place.name, "place", place.lat, place.lon, place.country, place.population)
    found.sort(key=lambda item: (item[0], item[1], item[2]["name"]))
    seen: set[str] = set()
    results = []
    for _, _, item in found:
        key = f"{item['name']}|{item['kind']}"
        if key not in seen:
            seen.add(key)
            results.append(item)
        if len(results) == 8:
            break
    return {"results": results}


@app.get("/api/scorefield")
def scorefield(
    target_id: str | None = Query(default=None),
    weights: str | None = Query(default=None, description="Comma separated key:weight pairs."),
) -> dict[str, Any]:
    """The whole 360 x 720 score surface, base64 float32, for map rendering."""
    if not target_id:
        target_id = next(iter(_targets()), None)
    request = ScoreRequest(target_id=target_id, weights=_parse_weights(weights))
    result, _, _ = _score(request)
    return _field(result.score)


@app.get("/api/validation")
def validation_report(
    target_id: str = Query(...),
    weights: str | None = Query(default=None, description="Comma separated key:weight pairs."),
) -> dict[str, Any]:
    """Known-analog validation (ROC-AUC and control percentiles) for one target."""
    request = ScoreRequest(target_id=target_id, weights=_parse_weights(weights))
    result, _, _ = _score(request)
    entry = _targets()[target_id]
    return validation.validate(
        result.score, str(entry["body"]), _catalog(), _validation_tag(target_id)
    )


@app.get("/api/analogs")
def analogs() -> dict[str, Any]:
    """The known-analog catalog used for validation and the novelty badge."""
    return _catalog()


@app.get("/api/predictor")
def predictor(key: str) -> dict[str, Any]:
    """One raw predictor grid, base64 float32 (NaN outside candidate land)."""
    stack = STATE.arrays
    if key not in stack:
        raise HTTPException(status_code=404, detail=f"unknown predictor {key!r}")
    return {"key": key, **_field(stack[key])}


@app.get("/api/cell")
def cell(lat: float, lon: float) -> dict[str, Any]:
    """Predictors, label, novelty and provenance for a single coordinate."""
    stack = STATE.arrays
    ranges = _ranges()
    if not -90.0 <= lat <= 90.0 or not -180.0 <= lon <= 180.0:
        raise HTTPException(status_code=422, detail="lat/lon out of range")
    row = min(max(int((90.0 - lat) // 0.5), 0), 359)
    col = min(max(int((lon + 180.0) // 0.5), 0), 719)
    clat, clon = _cell_centre(row, col)
    return {
        "row": row,
        "col": col,
        "lat": round(clat, 3),
        "lon": round(clon, 3),
        "label": _label_for(clat, clon),
        "candidate": bool(all(np.isfinite(stack[key][row, col]) for key in CRITERIA)),
        "values": {key: _round(stack[key][row, col]) for key in CRITERIA},
        "lst_source": _lst_source(row, col),
        "novelty": validation.novelty(clat, clon, _catalog()),
        "ranges": {key: {"min": ranges[key].min, "max": ranges[key].max} for key in CRITERIA},
        "sources": SOURCES,
    }


@app.get("/api/sources")
def sources() -> dict[str, Any]:
    """Dataset ids and URLs behind every number the API returns."""
    ranges = _ranges()
    return {
        "predictors": [
            {"key": key, "label": ranges[key].label, **SOURCES[key]} for key in CRITERIA
        ],
        "datasets": STATE.attrs.get("sources", []),
        "lst_fit": STATE.attrs.get("lst_fit"),
        "basemaps": BASEMAPS,
        "targets": [
            {
                "id": entry["id"],
                "source_url": entry["source_url"],
                "source_label": entry.get("source_label"),
                "criteria": {
                    key: {
                        "dataset_id": value.get("dataset_id"),
                        "source_url": value.get("source_url"),
                        "confidence": value.get("confidence"),
                    }
                    for key, value in entry["criteria"].items()
                },
            }
            for entry in _targets().values()
        ],
        "analogs": {
            "provenance": _catalog().get("provenance"),
            "sites": len(_catalog()["sites"]),
        },
    }


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def _optional(value: Any) -> float | None:
    """A finite float, or None for 'not used'."""
    if value is None:
        return None
    number = float(value)
    return round(number, 4) if math.isfinite(number) else None


def _validation_tag(target_id: str | None) -> str | None:
    return _targets()[target_id].get("validation_tag") if target_id else None


def _round(value: Any) -> float | None:
    number = float(value)
    return round(number, 4) if math.isfinite(number) else None


def _parse_weights(raw: str | None) -> dict[str, float] | None:
    if not raw:
        return None
    parsed: dict[str, float] = {}
    for pair in raw.split(","):
        if not pair.strip():
            continue
        if ":" not in pair:
            raise HTTPException(status_code=422, detail=f"bad weight {pair!r}")
        key, value = pair.split(":", 1)
        try:
            parsed[key.strip()] = float(value)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"bad weight {pair!r}") from exc
    return parsed


class _RevalidatingStaticFiles(StaticFiles):
    """Static files the browser must re-check on every load.

    Without a Cache-Control header browsers guess a freshness lifetime and can keep
    running an old app.js or globe.js after the code changes. "no-cache" still lets
    them reuse their copy, but only after a cheap ETag check (304 Not Modified).
    """

    async def get_response(self, path: str, scope):  # type: ignore[no-untyped-def]
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache"
        return response


if WEB_PATH.exists():
    app.mount("/", _RevalidatingStaticFiles(directory=str(WEB_PATH), html=True), name="web")
