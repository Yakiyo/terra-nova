"""Discovery controls: tolerance bands, new-sites filter, spread, robustness."""

from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.compute import similarity as sim
from src.compute import validation

client = TestClient(app)
RANGES = sim.load_normalization()


def test_tolerance_band_gives_full_similarity_inside_it():
    spec = RANGES["slope"]
    values = np.array([0.50, 0.60, 0.80])
    exact = sim.criterion_similarity(values, 0.5, spec)
    banded = sim.criterion_similarity(values, 0.5, spec, tolerance=0.1)
    assert exact[0] == 1.0 and exact[1] < 1.0
    assert banded[0] == 1.0 and banded[1] == pytest.approx(1.0)
    assert banded[2] == pytest.approx(1.0 - 0.2 / spec.span)
    with pytest.raises(sim.SimilarityError):
        sim.criterion_similarity(values, 0.5, spec, tolerance=-1)


def _score(**kw):
    body = {"target_id": "jezero_crater", "top_k": 10, "min_separation_cells": 3, **kw}
    return client.post("/api/score", json=body).json()


def test_new_only_excludes_known_and_near_known_sites():
    body = _score(target_id="haworth_psr", new_only=True, top_k=15)
    assert body["filters"]["new_only"] is True
    assert all(r["novelty"]["status"] == "new" for r in body["results"])


def test_minimum_distance_and_country_cap_spread_results():
    body = _score(min_distance_km=800, max_per_country=2)
    rows = body["results"]
    for i, a in enumerate(rows):
        for b in rows[i + 1 :]:
            assert validation.haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]) >= 800
    countries = [r["label"].get("country") for r in rows]
    assert max(countries.count(c) for c in set(countries)) <= 2


def test_tolerance_never_lowers_scores_and_validation_is_unfiltered():
    exact = _score(include_field=True)
    loose = _score(include_field=True, tolerance=1.5, new_only=True)
    assert loose["score_range"][1] >= exact["score_range"][1]
    assert loose["validation"]["auc"] >= 0.9
    assert loose["filters"]["tolerance"] == 1.5


def test_robustness_reports_stability_and_sensitivity():
    body = client.post("/api/robustness", json={"target_id": "lunar_south_pole", "top_k": 5}).json()
    assert body["runs"] >= 20 and len(body["stability"]) == 5
    assert all(0.0 <= v <= 1.0 for v in body["stability"].values())
    left_out = {row["without"] for row in body["sensitivity"]}
    assert "vegetation" in left_out and "elevation" not in left_out
    again = client.post(
        "/api/robustness", json={"target_id": "lunar_south_pole", "top_k": 5}
    ).json()
    assert again == body, "fixed seed: repeated calls must agree"


def test_independent_datasets_agree():
    checks = client.get("/api/datachecks").json()["checks"]
    assert {c["id"] for c in checks} >= {"lst_vs_power", "rain_vs_green", "lat_vs_seasonality"}
    for c in checks:
        assert c["passed"], f"{c['id']} rho={c['rho']}"
        assert c["cells"] > 50_000


def test_shortfall_is_explained_and_countries_use_borders():
    body = _score(
        target_id="haworth_psr", top_k=100, new_only=True, min_distance_km=2000, max_per_country=1
    )
    assert len(body["results"]) < 100
    assert body["shortfall"] and "per country" in body["shortfall"]
    assert _score()["shortfall"] is None


def test_region_footprint_covers_the_whole_atacama():
    # Northern Atacama, ~500 km from the catalogued centre point, is still "known/near".
    assert validation.novelty(-19.75, -69.75)["status"] in {"known", "near_known"}
    assert validation.novelty(-18.25, -70.25)["nearest_known"] == "Atacama Desert"
    assert validation.novelty(-18.25, -70.25)["status"] != "new"


def test_relief_image_is_built_on_request(monkeypatch, tmp_path):
    from src.acquire import peek

    monkeypatch.setattr(peek, "CACHE", tmp_path)
    calls = []

    def tile(kind, x0, x1, y0, y1, offline):
        calls.append(kind)
        # Synthetic image and Terrarium tiles isolate composition from local downloads.
        return np.full(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256, 3), 128, dtype=np.uint8)

    monkeypatch.setattr(peek, "_mosaic", tile)
    res = client.get("/api/peek.jpg", params={"lat": 40.75, "lon": 91.75})
    assert res.status_code == 200 and res.headers["content-type"] == "image/jpeg"
    assert calls == ["img", "dem"]
    assert client.get("/api/peek.jpg", params={"lat": 40.75, "lon": 91.75}).content == res.content
    assert calls == ["img", "dem"]
