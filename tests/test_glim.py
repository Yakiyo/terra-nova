"""Feature 1: the basaltic-rock layer (GLiM) and the lava-tube and permafrost archetypes."""

from __future__ import annotations

import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

from src.acquire import glim
from src.acquire.build_predictor_stack import DERIVED_DIR
from src.api.main import app
from src.compute.similarity import CRITERIA, DEFAULT_WEIGHTS
from src.compute.validation import cell_of

client = TestClient(app)
LAYER = np.load(DERIVED_DIR / "basaltic_volcanic.npy")


def test_rock_classes_map_to_scores():
    grid = np.array([[2, 10, 1], [16, -9999, 4]], dtype=float)
    classes = {1: "su", 2: "vb", 4: "pb", 10: "vi", 16: "ig"}
    out = glim.basaltic_volcanic(grid, classes, nodata=-9999)
    # basic volcanic -> 1, intermediate volcanic -> 0.5, anything else or no data -> 0
    assert out.tolist() == [[1.0, 0.5, 0.0], [0.0, 0.0, 0.0]]
    assert out.dtype == np.float32


def test_layer_is_on_the_grid_and_takes_three_values():
    assert LAYER.shape == (360, 720)
    assert np.isfinite(LAYER).all()   # finite everywhere, so it never unscores a cell
    assert set(np.unique(LAYER).tolist()) == {0.0, 0.5, 1.0}


@pytest.mark.parametrize(
    ("lat", "lon", "expected"),
    [
        (43.4617, -113.5627, 1.0),   # Craters of the Moon, Snake River Plain basalt
        (41.7139, -121.5083, 0.5),   # Lava Beds: GLiM's dominant class there is intermediate volcanic
        (-3.0, -60.0, 0.0),          # central Amazon: sediments
    ],
)
def test_layer_reads_known_places(lat, lon, expected):
    assert LAYER[cell_of(lat, lon, LAYER.shape)] == expected


def test_basalt_is_a_criterion_that_is_off_by_default():
    assert "basaltic_volcanic" in CRITERIA
    assert DEFAULT_WEIGHTS["basaltic_volcanic"] == 0.0
    sources = {s["dataset_id"] for s in client.get("/api/sources").json()["datasets"]}
    assert glim.DATASET_ID in sources


def test_existing_targets_do_not_use_basalt_and_the_lava_tube_target_does():
    targets = {t["id"]: t for t in client.get("/api/targets").json()["targets"]}
    for tid in ("lunar_south_pole", "malapert_massif", "haworth_psr", "jezero_crater", "gale_crater"):
        assert targets[tid]["criteria"]["basaltic_volcanic"]["value"] is None
        assert targets[tid]["default_weights"]["basaltic_volcanic"] == 0.0
    lava = targets["lunar_lava_tube"]
    assert lava["criteria"]["basaltic_volcanic"]["value"] == 1.0
    assert lava["default_weights"]["basaltic_volcanic"] == 2.0
    assert lava["criteria"]["mean_annual_temperature"]["value"] == 17.0


def test_lava_tube_sites_rank_in_earths_top_tier():
    report = client.get("/api/validation", params={"target_id": "lunar_lava_tube"}).json()
    positives = [c for c in report["controls"] if c["role"] == "positive"]
    assert len(positives) >= 5 and report["auc"] >= 0.9
    # Every catalogued lava-tube site scores in the top 5% of Earth's land for this target.
    assert all(c["percentile"] is not None and c["percentile"] >= 95 for c in positives), positives


def test_permafrost_target_validates_on_its_tagged_sites():
    report = client.get("/api/validation", params={"target_id": "utopia_permafrost"}).json()
    names = {c["name"] for c in report["controls"] if c["role"] == "positive"}
    assert names == {"Haughton impact crater, Devon Island", "Axel Heiberg Island", "McMurdo Dry Valleys"}
    assert report["auc"] >= 0.9


def test_new_catalog_sites_are_cited():
    catalog = json.loads((DERIVED_DIR.parents[1] / "data" / "known_analogs.json").read_text(encoding="utf-8"))
    tube = [s for s in catalog["sites"] if "lava_tube" in s.get("tags", [])]
    assert len(tube) == 5
    assert all(s["source_url"].startswith("https://en.wikipedia.org/wiki/") for s in tube)
