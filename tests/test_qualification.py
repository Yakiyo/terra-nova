"""Feature 3: the hardware test readiness matrix."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.compute import qualification
from src.compute.similarity import load_normalization

client = TestClient(app)
RANGES = load_normalization()
SOURCES = {key: {"dataset_id": f"ds_{key}", "source_url": f"https://example.org/{key}"} for key in RANGES}


def _matrix(values, lat, **kw):
    return {c["id"]: c for c in qualification.assess(values, lat, RANGES, SOURCES, **kw)}


DRY_VALLEY_LIKE = {
    "precipitation": 90.0, "vegetation": 0.0, "annual_temperature_range": 30.0, "lst_diurnal_range": 8.0,
    "slope": 0.3, "roughness": 40.0, "elevation": 900.0, "mean_annual_temperature": -20.0, "basaltic_volcanic": 0.0,
}
RAINFOREST = {
    "precipitation": 2600.0, "vegetation": 0.88, "annual_temperature_range": 2.0, "lst_diurnal_range": 5.0,
    "slope": 0.05, "roughness": 2.0, "elevation": 100.0, "mean_annual_temperature": 26.0, "basaltic_volcanic": 0.0,
}


def test_cold_barren_dry_ground_is_ready_for_the_ice_drill():
    drill = _matrix(DRY_VALLEY_LIKE, -77.5)["ice_drill"]
    assert drill["verdict"] == "ready"
    assert [r["status"] for r in drill["requirements"]] == ["pass", "pass", "pass"]


def test_rainforest_suits_nothing():
    assert {c["verdict"] for c in _matrix(RAINFOREST, -3.0).values()} == {"not_suited"}


def test_status_bands():
    # mean temperature: threshold -5 C, Earth range ~82 K, so "near" means within ~8.2 K
    def drill(t):
        return _matrix({**DRY_VALLEY_LIKE, "mean_annual_temperature": t}, -77.5)["ice_drill"]["requirements"][0]["status"]

    assert drill(-6.0) == "pass"
    assert drill(-1.0) == "near"
    assert drill(10.0) == "fail"
    missing = _matrix({**DRY_VALLEY_LIKE, "mean_annual_temperature": float("nan")}, -77.5)["ice_drill"]
    assert missing["requirements"][0]["status"] == "no_data" and missing["verdict"] != "ready"


def test_low_sun_share_follows_solar_geometry():
    equator, seventy, eighty = (qualification.low_sun_share(x) for x in (0.0, 70.0, 80.0))
    assert equator == pytest.approx(0.12, abs=0.01)
    assert seventy == pytest.approx(0.37, abs=0.01)
    assert equator < eighty < seventy
    # Nearly symmetric between hemispheres (the declination formula's day offset adds ~0.1%).
    assert qualification.low_sun_share(-70.0) == pytest.approx(seventy, abs=0.005)
    # The threshold is reachable on Earth.
    assert max(qualification.low_sun_share(x) for x in range(0, 91, 5)) >= 0.30


def test_rover_uses_terrain_when_known_and_says_when_it_does_not():
    regional = _matrix(DRY_VALLEY_LIKE, -77.5)["rover"]["requirements"][0]
    assert regional["metric"] == "slope" and "God's Eye" in regional["why"]
    local = _matrix(DRY_VALLEY_LIKE, -77.5, share_under_15=0.93)["rover"]["requirements"][0]
    assert local["metric"] == "share_under_15" and local["status"] == "pass"


def test_every_requirement_is_sourced():
    for cat in qualification.CATEGORIES:
        assert cat.system_url.startswith("https://")
        for req in cat.requirements:
            assert req.source_url.startswith("https://") and req.why
    for cat in _matrix(DRY_VALLEY_LIKE, -77.5).values():
        for row in cat["requirements"]:
            assert row["dataset_id"] and row["source_url"].startswith("https://")


def test_qualification_endpoint_and_ranked_rows():
    body = client.get("/api/qualification", params={"lat": -77.47, "lon": 162.52}).json()
    cats = {c["id"]: c for c in body["categories"]}
    assert cats["ice_drill"]["verdict"] == "ready"   # McMurdo Dry Valleys
    assert body["trl_source_url"].startswith("https://www.nasa.gov/")
    amazon = client.get("/api/qualification", params={"lat": -3.0, "lon": -60.0}).json()
    assert {c["verdict"] for c in amazon["categories"]} == {"not_suited"}
    rows = client.post("/api/score", json={"target_id": "haworth_psr", "top_k": 3}).json()["results"]
    assert all(set(r["readiness"]) == {"ice_drill", "low_sun_navigation", "eva_suit", "rover"} for r in rows)
