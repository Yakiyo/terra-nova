"""Pre-demo polish: caching, polar terrain coverage, input limits and validation sets."""

from __future__ import annotations

import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

from src.acquire import sitetiles
from src.api import main
from src.api.main import UI_DEFAULTS, app, cell_coverage
from src.compute import datachecks

client = TestClient(app)


def test_robustness_cache_key_ignores_spelled_out_default_weights():
    """The interface always sends the target's full default weights; the warm-up does not."""
    bare = main.ScoreRequest(target_id="jezero_crater", **UI_DEFAULTS)
    weights = client.get("/api/targets").json()["targets"]
    jezero = next(t for t in weights if t["id"] == "jezero_crater")["default_weights"]
    explicit = main.ScoreRequest(target_id="jezero_crater", weights=jezero, **UI_DEFAULTS)
    assert main._robustness_key(bare) == main._robustness_key(explicit)
    changed = main.ScoreRequest(
        target_id="jezero_crater", weights={**jezero, "slope": 3.0}, **UI_DEFAULTS
    )
    assert main._robustness_key(changed) != main._robustness_key(bare)


def test_robustness_second_request_is_cached():
    body = {**UI_DEFAULTS, "target_id": "gale_crater"}
    first = client.post("/api/robustness", json=body).json()
    start = time.perf_counter()
    second = client.post("/api/robustness", json=body).json()
    assert time.perf_counter() - start < 0.5
    assert first == second


@pytest.mark.parametrize(
    ("lat", "lon", "low", "high"),
    [(0.25, 10.25, 1.0, 1.0), (40.75, 91.75, 1.0, 1.0), (70.75, 20.25, 0.85, 0.97),
     (-81.75, 73.25, 0.35, 0.45), (0.25, 179.75, 1.0, 1.0)],
)
def test_cell_coverage_shrinks_towards_the_poles(lat, lon, low, high):
    x0, y0 = sitetiles.mosaic_origin(lat, lon)
    assert low <= cell_coverage(lat, lon, x0, y0, sitetiles.DEM_ZOOM, sitetiles.MOSAIC) <= high


def test_weights_are_capped():
    body = {"target_id": "jezero_crater", "weights": {"slope": 1e308}}
    assert client.post("/api/score", json=body).status_code == 422
    assert client.post("/api/score", json={**body, "weights": {"slope": 100}}).status_code == 200


def test_correlation_with_too_few_cells_is_null_not_nan():
    land = np.zeros((4, 4), dtype=bool)
    land[0, :3] = True
    arrays = {k: np.arange(16, dtype=float).reshape(4, 4) for c in datachecks.CHECKS for k in (c["a"], c["b"])}
    for row in datachecks.run(arrays, land):
        assert row["rho"] is None and row["passed"] is False


def test_all_zero_weights_explains_which_criteria_need_one():
    criteria = {key: None for key in main.CRITERIA}
    criteria["elevation"] = 3000.0
    response = client.post("/api/score", json={"criteria": criteria, "body": "Moon"})
    assert response.status_code == 422 and "elevation" in response.json()["detail"]


def test_polar_moon_targets_do_not_count_lava_tube_sites():
    for target_id in ("lunar_south_pole", "malapert_massif"):
        body = client.post("/api/score", json={"target_id": target_id, "top_k": 3}).json()
        names = {c["name"] for c in body["validation"]["controls"] if c["role"] == "positive"}
        assert names == {"Meteor Crater, Arizona", "Craters of the Moon, Idaho", "Askja, Iceland"}
        assert body["validation"]["auc"] >= 0.9


def test_readiness_never_waits_for_uncached_terrain(monkeypatch):
    calls = []

    def no_network(*args, offline=None, **kwargs):
        calls.append(offline)
        raise main.FetchError("not cached")

    monkeypatch.setattr(sitetiles, "dem_mosaic", no_network)
    main._site_block.cache_clear()
    main._site3d_payload.cache_clear()
    body = client.get("/api/qualification", params={"lat": 12.25, "lon": 30.25, "terrain": 1}).json()
    assert calls and all(flag is True for flag in calls)
    assert "not cached" in body["terrain_basis"]
