"""Validation, novelty and the pure helpers of the new acquisition stages."""

from __future__ import annotations

import numpy as np
import pytest
from PIL import Image

from src.acquire import gibs_ndvi, power
from src.compute import validation

CATALOG = {
    "sites": [
        {
            "name": "Known A",
            "lat": 10.25,
            "lon": 10.25,
            "bodies": ["mars"],
            "kind": "environment",
            "source_url": "https://example.org/a",
        },
        {
            "name": "Rocks B",
            "lat": -30.25,
            "lon": 40.25,
            "bodies": ["mars", "moon"],
            "kind": "geology",
            "source_url": "https://example.org/b",
        },
    ],
    "negatives": [{"name": "Wet C", "lat": 0.25, "lon": 0.25, "reason": "test"}],
}


def _grid() -> np.ndarray:
    score = np.full((360, 720), 0.5)
    score[validation.cell_of(10.25, 10.25, score.shape)] = 0.9
    score[validation.cell_of(0.25, 0.25, score.shape)] = 0.1
    return score


def test_roc_auc_counts_wins_and_ties():
    assert validation.roc_auc([0.9, 0.8], [0.1, 0.2]) == pytest.approx(1.0)
    assert validation.roc_auc([0.1], [0.9]) == pytest.approx(0.0)
    assert validation.roc_auc([0.5], [0.5]) == pytest.approx(0.5)
    assert validation.roc_auc([], [0.5]) is None


def test_validate_uses_environment_sites_of_the_right_body():
    report = validation.validate(_grid(), "Mars", CATALOG)
    roles = {c["name"]: c["role"] for c in report["controls"]}
    assert roles == {"Known A": "positive", "Rocks B": "geology", "Wet C": "negative"}
    assert report["auc"] == pytest.approx(1.0)
    assert report["positives"] == 1 and report["negatives"] == 1
    known = next(c for c in report["controls"] if c["name"] == "Known A")
    assert known["percentile"] > 99.0

    moon = validation.validate(_grid(), "Moon", CATALOG)
    assert moon["positives"] == 0 and moon["auc"] is None


def test_sites_on_unscored_cells_snap_to_the_nearest_scored_cell():
    score = np.full((360, 720), np.nan)
    row, col = validation.cell_of(10.25, 10.25, score.shape)
    score[row + 1, col] = 0.7
    assert validation.nearest_scored(score, 10.25, 10.25) == (row + 1, col)
    assert validation.nearest_scored(np.full((360, 720), np.nan), 10.25, 10.25) is None


def test_novelty_bands():
    assert validation.novelty(10.3, 10.3, CATALOG)["status"] == "known"
    assert validation.novelty(13.0, 10.3, CATALOG)["status"] == "near_known"
    far = validation.novelty(60.0, -120.0, CATALOG)
    assert far["status"] == "new" and far["distance_km"] > validation.NEAR_KM


def test_real_catalog_is_cited():
    catalog = validation.load_catalog()
    assert catalog["sites"] and catalog["negatives"]
    for site in catalog["sites"]:
        assert site["source_url"].startswith("https://en.wikipedia.org/wiki/")
        assert site["kind"] in {"environment", "geology"}
        assert set(site["bodies"]) <= {"moon", "mars"}
        assert -90 <= site["lat"] <= 90 and -180 <= site["lon"] <= 180


def test_gibs_colour_inversion(tmp_path):
    lut = np.full(1 << 24, np.nan, dtype=np.float32)
    lut[(10 << 16) | (20 << 8) | 30] = 0.45
    rgba = np.zeros((2, 2, 4), dtype=np.uint8)
    rgba[0, 0] = (10, 20, 30, 255)  # known colour
    rgba[0, 1] = (1, 2, 3, 255)  # unknown colour
    rgba[1, 0] = (10, 20, 30, 0)  # transparent: NDVI <= 0 or no data
    path = tmp_path / "ndvi.png"
    Image.fromarray(rgba, "RGBA").save(path)
    ndvi = gibs_ndvi.decode(path, lut)
    assert ndvi[0, 0] == pytest.approx(0.45)
    assert ndvi[0, 1] == 0.0 and ndvi[1, 0] == 0.0 and ndvi[1, 1] == 0.0


def test_power_regrid_is_exact_on_a_linear_field():
    lat2, _ = np.meshgrid(power.POWER_LAT, power.POWER_LON, indexing="ij")
    native = 2.0 * lat2 + 3.0
    cells = power.to_cell_grid(native, np.array([10.25, -45.75]), np.array([0.25, 179.75]))
    np.testing.assert_allclose(cells[:, 0], 2.0 * np.array([10.25, -45.75]) + 3.0)
    np.testing.assert_allclose(cells[:, 1], 2.0 * np.array([10.25, -45.75]) + 3.0)


def test_power_boxes_follow_land():
    land = np.zeros((360, 720), dtype=bool)
    land[validation.cell_of(15.0, 15.0, land.shape)] = True
    assert (10, 10) in power.boxes_with_land(land)
    assert len(power.boxes_with_land(land)) <= 4


def test_distance_grid_matches_point_novelty():
    catalog = validation.load_catalog()
    grid = validation.distance_grid(catalog)
    for lat, lon in [(-19.75, -69.75), (40.75, 91.75), (-77.25, 162.25), (0.25, 20.25)]:
        row, col = validation.cell_of(lat, lon, grid.shape)
        clat, clon = 90 - (row + 0.5) * 0.5, -180 + (col + 0.5) * 0.5
        assert grid[row, col] == pytest.approx(
            validation.novelty(clat, clon, catalog)["distance_km"], abs=0.1
        )


def test_fetch_gives_up_on_a_trickling_download(tmp_path):
    """A server that keeps sending tiny chunks must not hang the app."""
    import http.server
    import threading
    import time as _time

    from src.acquire.download import FetchError, fetch

    class Slow(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            for _ in range(40):
                self.wfile.write(b"x" * 64)
                self.wfile.flush()
                _time.sleep(0.1)

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Slow)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/tile"
    started = _time.monotonic()
    with pytest.raises(FetchError, match="longer than"):
        fetch(url, filename="slow.bin", raw_dir=tmp_path, offline=False, timeout=5, max_seconds=1)
    assert _time.monotonic() - started < 3.5
    assert not (tmp_path / "slow.bin").exists(), "a failed download must not be cached"
    server.shutdown()
