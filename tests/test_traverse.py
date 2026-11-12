"""Feature 5: EVA traverse analysis on a God's Eye elevation block."""

from __future__ import annotations

import math

import numpy as np
import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.compute import terrain, traverse

client = TestClient(app)
Z = 10
SIZE = 1024
X0, Y0 = 500, 500          # near the equator (tile row 512 is 0 degrees)


def _block(dem: np.ndarray) -> traverse.Block:
    return traverse.block_from_mosaic(dem, X0, Y0, Z)


def _lonlat(block: traverse.Block, col: float, row: float) -> dict:
    return {"lat": float(block.lat_at(row)), "lon": float(block.lon_at(col))}


def test_tilted_plane_grade_and_slope_match_the_analytic_values():
    rise = 3.0                                   # metres per pixel, eastward
    dem = np.tile(np.arange(SIZE, dtype=float) * rise, (SIZE, 1))
    block = _block(dem)
    row = 400.5                                  # a pixel-centre row
    route = [_lonlat(block, 100.5, row), _lonlat(block, 900.5, row)]
    out = traverse.analyse(block, route)

    pixel_m = float(terrain.pixel_size_m(Z, np.array([block.lat_at(row)]))[0])
    expected = math.degrees(math.atan(rise / pixel_m))
    grades = np.array(out["samples"]["grade_deg"])
    assert grades == pytest.approx(expected, abs=0.02)
    assert out["total"]["max_terrain_slope_deg"] == pytest.approx(expected, abs=0.02)
    assert out["total"]["distance_km"] == pytest.approx(800 * pixel_m / 1000, rel=1e-3)
    assert out["total"]["climb_m"] == pytest.approx(800 * rise, abs=0.5)
    assert out["total"]["descent_m"] == 0.0
    # The same route backwards descends, and Tobler makes the descent the faster walk.
    back = traverse.analyse(block, route[::-1])
    assert back["total"]["descent_m"] == pytest.approx(800 * rise, abs=0.5)
    assert back["total"]["walk_hours"] < out["total"]["walk_hours"]


def test_grade_never_exceeds_the_ground_slope():
    rng = np.random.default_rng(3)
    dem = np.cumsum(np.cumsum(rng.normal(0, 4, (SIZE, SIZE)), axis=0), axis=1) * 0.05   # rough random terrain
    block = _block(dem)
    out = traverse.analyse(block, [_lonlat(block, 50.5, 80.5), _lonlat(block, 900.2, 610.7), _lonlat(block, 400.5, 950.5)])
    grade = np.abs(out["samples"]["grade_deg"])
    slope = np.array(out["samples"]["terrain_slope_deg"])
    assert grade.size == slope.size and np.all(grade <= slope + 0.011)   # rounding to 0.01
    assert out["total"]["max_grade_deg"] <= out["total"]["max_terrain_slope_deg"]
    for leg in out["legs"]:
        assert leg["max_grade_deg"] <= leg["max_terrain_slope_deg"]


def test_two_waypoints_on_one_spot_do_not_break_the_route():
    dem = np.tile(np.arange(SIZE, dtype=float) * 2.0, (SIZE, 1))
    block = _block(dem)
    a, b = _lonlat(block, 100.5, 100.5), _lonlat(block, 300.5, 100.5)
    out = traverse.analyse(block, [a, a, b])
    assert out["legs"][0]["distance_km"] == 0.0
    assert out["total"]["max_grade_deg"] > 0 and np.all(np.isfinite(out["samples"]["grade_deg"]))


def test_tobler_peaks_on_a_gentle_descent():
    speeds = traverse.tobler_kmh(np.array([-0.05, 0.0, 0.2]))
    assert speeds[0] == pytest.approx(6.0)
    assert speeds[0] > speeds[1] > speeds[2]


def test_one_ridge_gives_exactly_one_hazard_interval():
    dem = np.zeros((SIZE, SIZE))
    cols = np.arange(SIZE)
    ridge = np.clip(1.0 - np.abs(cols - 512) / 6.0, 0.0, None) * 600.0   # ~600 m over 6 px
    dem += ridge[None, :]
    block = _block(dem)
    out = traverse.analyse(block, [_lonlat(block, 300.5, 300.5), _lonlat(block, 700.5, 300.5)])
    assert len(out["hazards"]) == 1
    hazard = out["hazards"][0]
    assert hazard["max_slope_deg"] >= terrain.TRAFFICABLE_DEG
    assert hazard["start_km"] < hazard["at_km"] < hazard["end_km"]
    assert 0 < out["total"]["share_over_limit"] < 0.1
    # A flat route has none.
    flat = traverse.analyse(block, [_lonlat(block, 100.5, 300.5), _lonlat(block, 400.5, 300.5)])
    assert flat["hazards"] == [] and flat["total"]["share_over_limit"] == 0.0


def test_multi_leg_route_keeps_waypoints_and_legs_in_order():
    dem = np.add.outer(np.arange(SIZE) * 0.5, np.arange(SIZE) * 1.0)
    block = _block(dem)
    names = ["Basecamp", "Science Station", "Drill Site"]
    route = [{**_lonlat(block, c, r), "name": n} for (c, r), n in zip([(200.5, 200.5), (600.5, 200.5), (600.5, 700.5)], names, strict=True)]
    out = traverse.analyse(block, route)
    assert [w["name"] for w in out["waypoints"]] == names
    assert [(leg["from"], leg["to"]) for leg in out["legs"]] == [("Basecamp", "Science Station"), ("Science Station", "Drill Site")]
    assert sum(leg["distance_km"] for leg in out["legs"]) == pytest.approx(out["total"]["distance_km"], abs=0.002)
    assert out["waypoints"][-1]["d_km"] == pytest.approx(out["total"]["distance_km"], abs=0.001)
    assert out["waypoints"][1]["u"] == pytest.approx(600.5 / SIZE, abs=1e-4)


def test_waypoint_outside_the_block_and_bad_counts_are_rejected():
    block = _block(np.zeros((SIZE, SIZE)))
    inside = _lonlat(block, 100.5, 100.5)
    with pytest.raises(traverse.TraverseError, match="outside"):
        traverse.analyse(block, [inside, _lonlat(block, SIZE + 50, 100)])
    with pytest.raises(traverse.TraverseError, match="2-8"):
        traverse.analyse(block, [inside])

    site = {"lat": 43.4, "lon": -113.5}
    far = client.post("/api/traverse", json={**site, "waypoints": [site, {"lat": 10.0, "lon": 10.0}]})
    assert far.status_code == 422 and "outside" in far.json()["detail"]
    one = client.post("/api/traverse", json={**site, "waypoints": [site]})
    assert one.status_code == 422
    many = client.post("/api/traverse", json={**site, "waypoints": [site] * 9})
    assert many.status_code == 422


def test_dateline_waypoints_map_onto_the_block():
    block = traverse.Block(dem=np.zeros((SIZE, SIZE)), slope=np.zeros((SIZE, SIZE)), x0=1022, y0=Y0, z=Z)
    col, _ = block.to_pixel(0.0, -179.9)          # just east of the dateline, inside the block
    assert block.contains(col, 300.0)


def test_endpoint_on_a_cached_block_is_cited():
    lat, lon = -81.75, 73.25                      # #1 Haworth site; terrain cached by the demo prefetch
    site3d = client.get("/api/site3d", params={"lat": lat, "lon": lon})
    if site3d.status_code != 200:
        pytest.skip("site terrain not cached on this machine")
    b = site3d.json()["bounds"]
    mid_lon = (b["west"] + b["east"]) / 2
    route = [{"lat": lat, "lon": mid_lon - 0.5, "name": "Basecamp"}, {"lat": lat, "lon": mid_lon + 0.5, "name": "Drill Site"}]
    body = client.post("/api/traverse", json={"lat": lat, "lon": lon, "waypoints": route}).json()
    assert body["provenance"]["dataset_id"] == "aws_terrain_tiles_terrarium"
    assert body["walking_model"]["source_url"].startswith("https://")
    assert body["total"]["distance_km"] > 0 and len(body["samples"]["d_km"]) > 10
    assert body["sample_spacing_m"] < 160
