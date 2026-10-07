"""End-to-end checks for the HTTP surface.

These use FastAPI's in-process TestClient, so they need no running server and
no network. They cover the read-only endpoints, the ranking endpoint, the
error paths and the provenance contract (every numeric claim carries a dataset
id and a source url).
"""

from __future__ import annotations

import base64

import numpy as np
import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.compute.similarity import CRITERIA

client = TestClient(app)


def _decode(payload: dict) -> np.ndarray:
    raw = base64.b64decode(payload["data"])
    return np.frombuffer(raw, dtype="<f4").reshape(payload["shape"])


# --------------------------------------------------------------------------
# read-only endpoints
# --------------------------------------------------------------------------


def test_static_ui_is_served():
    page = client.get("/")
    assert page.status_code == 200
    assert "text/html" in page.headers["content-type"]
    script = client.get("/app.js")
    assert script.status_code == 200
    assert client.get("/missing.js").status_code == 404


def test_health_reports_the_grid():
    body = client.get("/api/health").json()
    assert body["ok"] is True
    assert body["shape"] == [360, 720]
    assert set(body["criteria"]) == set(CRITERIA)
    assert body["candidate_cells"] > 70_000
    assert body["gazetteer"] is True


def test_criteria_expose_ranges_and_weight_shares():
    body = client.get("/api/criteria").json()
    assert [item["key"] for item in body["criteria"]] == list(CRITERIA)
    for item in body["criteria"]:
        assert item["min"] < item["max"], item["key"]
        assert item["label"], item["key"]
        assert item["unit"] is not None, item["key"]
    assert [item["key"] for item in body["weights"]] == list(CRITERIA)
    assert sum(item["share"] for item in body["weights"]) == pytest.approx(1.0)
    for item in body["criteria"]:
        assert item["earth_min"] <= item["earth_max"], item["key"]
        assert item["dataset_id"] and item["source_url"].startswith("http"), item["key"]


def test_targets_and_sources_carry_provenance():
    targets = client.get("/api/targets").json()["targets"]
    assert {"lunar_south_pole", "jezero_crater"} <= {t["id"] for t in targets}

    sources = client.get("/api/sources").json()
    for entry in sources["predictors"]:
        assert entry["dataset_id"], entry["key"]
        assert entry["source_url"].startswith("http"), entry["key"]
    for target in sources["targets"]:
        assert target["source_url"].startswith("http"), target["id"]
        for claim in target["criteria"].values():
            assert claim["dataset_id"] and claim["source_url"]


def test_predictor_grid_round_trips():
    payload = client.get("/api/predictor", params={"key": "elevation"}).json()
    grid = _decode(payload)
    assert grid.shape == (360, 720)
    assert np.isnan(grid).any(), "ocean must be NaN"
    assert np.isfinite(grid).any()
    assert payload["min"] <= payload["max"]
    assert client.get("/api/predictor", params={"key": "nope"}).status_code == 404


# --------------------------------------------------------------------------
# ranking
# --------------------------------------------------------------------------


def test_score_ranks_a_target_with_rationales():
    body = client.post(
        "/api/score",
        json={"target_id": "lunar_south_pole", "top_k": 5, "min_separation_cells": 2},
    ).json()

    assert body["target_id"] == "lunar_south_pole"
    assert 0.0 <= body["score_range"][0] <= body["score_range"][1] <= 1.0
    assert body["effective_profile"]["lst_diurnal_range"] < body["profile"]["lst_diurnal_range"]
    assert body["validation"]["auc"] is not None
    assert "field" not in body
    assert [row["rank"] for row in body["results"]] == [1, 2, 3, 4, 5]
    for row in body["results"]:
        assert 0.0 <= row["score"] <= 1.0
        assert row["label"]["text"]
        assert set(row["values"]) == set(CRITERIA)
        assert set(row["similarities"]) == set(CRITERIA)
        assert all(v is None or 0.0 <= v <= 1.0 for v in row["similarities"].values())
        assert row["novelty"]["status"] in {"known", "near_known", "new"}
        assert 0.0 <= row["percentile"] <= 100.0
        rationale = row["rationale"]
        assert rationale["headline"]
        assert rationale["claims"], "a winner must be explained"
        for claim in rationale["claims"]:
            assert claim["dataset_id"] and claim["source_url"]


def test_score_is_deterministic():
    request = {"target_id": "jezero_crater", "top_k": 3}
    assert (
        client.post("/api/score", json=request).json()
        == client.post("/api/score", json=request).json()
    )


def test_custom_profile_gets_a_rationale_too():
    profile = {key: 0.5 for key in CRITERIA}
    body = client.post("/api/score", json={"criteria": profile, "top_k": 2}).json()
    assert body["target_id"] is None
    assert body["validation"] is None
    for row in body["results"]:
        assert row["rationale"]["claims"]


def test_score_can_return_the_weighted_field():
    """The map must show the same weights as the ranking."""
    plain = client.post("/api/score", json={"target_id": "jezero_crater", "include_field": True})
    heavy = client.post(
        "/api/score",
        json={"target_id": "jezero_crater", "include_field": True, "weights": {"slope": 5}},
    )
    a, b = _decode(plain.json()["field"]), _decode(heavy.json()["field"])
    assert a.shape == (360, 720)
    assert not np.allclose(a, b, equal_nan=True)


def test_validation_separates_known_analogs_from_vegetated_land():
    targets = [t["id"] for t in client.get("/api/targets").json()["targets"]]
    assert {"malapert_massif", "haworth_psr", "gale_crater"} <= set(targets)
    for target in targets:
        report = client.get("/api/validation", params={"target_id": target}).json()
        assert report["positives"] >= 3 and report["negatives"] >= 5
        assert report["auc"] >= 0.9, target


def test_known_analog_catalog_is_served():
    catalog = client.get("/api/analogs").json()
    assert len(catalog["sites"]) >= 10


def test_score_rejects_bad_requests():
    assert client.post("/api/score", json={}).status_code == 422
    unknown = client.post("/api/score", json={"target_id": "nowhere"})
    assert unknown.status_code == 404
    partial = client.post("/api/score", json={"criteria": {"elevation": 1.0}})
    assert client.get("/api/scorefield", params={"weights": "slope:x"}).status_code == 422
    assert partial.status_code == 422
    extra = client.post(
        "/api/score", json={"criteria": {**{key: 1.0 for key in CRITERIA}, "nope": 1.0}}
    )
    assert extra.status_code == 422
    bad_weights = client.post(
        "/api/score", json={"target_id": "lunar_south_pole", "weights": {"aridity": -1.0}}
    )
    assert bad_weights.status_code == 422


def test_scorefield_and_cell():
    field = client.get("/api/scorefield", params={"target_id": "lunar_south_pole"}).json()
    surface = _decode(field)
    assert field["shape"] == [360, 720]
    assert field["min"] <= field["max"]
    assert np.isfinite(surface).any()

    ocean = client.get("/api/cell", params={"lat": 0.0, "lon": -140.0}).json()
    assert ocean["candidate"] is False
    assert ocean["values"]["elevation"] is None

    assert client.get("/api/cell", params={"lat": 999.0, "lon": 0.0}).status_code == 422


def test_explain_any_location():
    body = client.post(
        "/api/explain", params={"lat": 75.38, "lon": -89.68}, json={"target_id": "jezero_crater"}
    ).json()
    assert body["scored"] is True
    assert body["novelty"]["status"] == "known"
    assert 0.0 < body["score"] <= 1.0
    assert body["rationale"]["claims"]

    ocean = client.post(
        "/api/explain", params={"lat": 0.0, "lon": -140.0}, json={"target_id": "jezero_crater"}
    ).json()
    assert ocean["scored"] is False and ocean["reason"]


def test_thumbnail_served_from_cache_and_404_offline(monkeypatch):
    cached = client.get("/api/thumb", params={"lat": 75.38, "lon": -89.68})
    assert cached.status_code == 200
    assert cached.headers["content-type"] == "image/jpeg"
    assert cached.headers["x-credit"].startswith("NASA")
    assert cached.content[:2] == b"\xff\xd8"

    monkeypatch.setenv("OFFLINE", "1")
    missing = client.get("/api/thumb", params={"lat": -60.0, "lon": -140.0})
    assert missing.status_code == 404


def test_target_default_weights_and_unused_criteria():
    targets = {t["id"]: t for t in client.get("/api/targets").json()["targets"]}
    haworth = targets["haworth_psr"]
    assert haworth["default_weights"]["mean_annual_temperature"] == 2.0
    assert haworth["criteria"]["slope"]["effective_value"] is None
    assert targets["jezero_crater"]["default_weights"]["mean_annual_temperature"] == 0.0

    body = client.post("/api/score", json={"target_id": "haworth_psr", "top_k": 3}).json()
    assert body["weights"]["slope"] == 0.0 and body["weights"]["mean_annual_temperature"] > 0
    assert body["effective_profile"]["slope"] is None
    assert body["validation"]["tag"] == "cold_polar"
    assert all(r["similarities"]["slope"] is None for r in body["results"])


def test_manual_profile_with_unused_criteria():
    profile = dict.fromkeys(CRITERIA)
    profile.update({"precipitation": 0.0, "vegetation": 0.0, "lst_diurnal_range": 30.0})
    body = client.post("/api/score", json={"criteria": profile, "body": "mars", "top_k": 5}).json()
    assert len(body["results"]) == 5
    assert body["validation"]["body"] == "mars"
    assert body["weights"]["slope"] == 0.0


def test_tile_addresses_are_validated(monkeypatch):
    assert client.get("/api/tile/9/0/0.jpg").status_code == 422
    assert client.get("/api/tile/1/99/0.jpg").status_code == 422
    monkeypatch.setenv("OFFLINE", "1")
    missing = client.get("/api/tile/2/71/143.jpg")
    assert missing.status_code in (200, 404)


def test_search_finds_places_and_coordinates():
    names = [
        r["name"] for r in client.get("/api/search", params={"q": "atacama"}).json()["results"]
    ]
    assert "Atacama Desert" in names
    coords = client.get("/api/search", params={"q": "-24.5, -69.25"}).json()["results"]
    assert coords[0]["kind"] == "coordinates" and coords[0]["lat"] == -24.5
    assert client.get("/api/search", params={"q": "zzzzqqq"}).json()["results"] == []


def test_site3d_rejects_polar_and_bad_imagery(monkeypatch):
    assert client.get("/api/site3d", params={"lat": -86.0, "lon": 10.0}).status_code == 422
    assert client.get("/api/imagery/nope/11/0/0.jpg").status_code == 422
    assert client.get("/api/imagery/s2/5/0/0.jpg").status_code == 422
    monkeypatch.setenv("OFFLINE", "1")
    uncached = client.get("/api/site3d", params={"lat": 5.25, "lon": -150.25})
    assert uncached.status_code in (404, 422)


def test_site3d_offline_miss_explains_the_fix(monkeypatch):
    monkeypatch.setenv("OFFLINE", "1")
    res = client.get("/api/site3d", params={"lat": -33.25, "lon": 140.25})
    if res.status_code == 404:
        assert "cache/sitetiles" in res.json()["detail"]
