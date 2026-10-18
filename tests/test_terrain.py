"""Terrain maths for the God's Eye view (pure functions, no network)."""

from __future__ import annotations

import math

import numpy as np
import pytest

from src.compute import terrain


def test_tile_round_trip():
    for lat, lon in [(0.0, 0.0), (28.25, 63.25), (-45.5, -120.25), (75.0, 170.0)]:
        x, y = terrain.lonlat_to_tile(lat, lon, 10)
        assert terrain.tile_to_lat(y, 10) == pytest.approx(lat, abs=1e-9)
        assert terrain.tile_to_lon(x, 10) == pytest.approx(lon, abs=1e-9)


def test_terrarium_decoding():
    rgb = np.array([[[128, 0, 0], [128, 100, 128]]], dtype=np.uint8)
    np.testing.assert_allclose(terrain.decode_terrarium(rgb)[0], [0.0, 100.5])


def test_slope_of_a_known_ramp():
    """A plane rising 1 m per metre eastwards has a 45 degree slope everywhere."""
    lat = np.zeros(8)
    size = terrain.pixel_size_m(10, lat)[0]
    dem = np.tile(np.arange(8) * size, (8, 1))
    slope = terrain.slope_degrees(dem, lat, 10)
    np.testing.assert_allclose(slope, 45.0, atol=1e-9)


def test_pixel_size_shrinks_with_latitude():
    sizes = terrain.pixel_size_m(10, np.array([0.0, 60.0]))
    assert sizes[0] == pytest.approx(152.874, abs=0.01)
    assert sizes[1] == pytest.approx(sizes[0] * math.cos(math.radians(60)))


def test_display_slopes_match_mesh_central_differences():
    # Interior is a one-to-one ramp; boundary uses a clamped neighbour.
    heights = np.tile(np.arange(5, dtype=float), (5, 1))
    slopes = terrain.display_slopes(heights, ground_size_m=4.0)
    np.testing.assert_allclose(slopes[:, 1:-1], 45.0)
    np.testing.assert_allclose(slopes[:, [0, -1]], math.degrees(math.atan(0.5)))
    np.testing.assert_array_equal(terrain.display_slopes(np.zeros((5, 5)), 4.0), 0.0)


def test_stats_and_cell_mask():
    dem = np.array([[0.0, 10.0], [20.0, 30.0]])
    slope = np.array([[1.0, 4.0], [10.0, 20.0]])
    s = terrain.stats(dem, slope)
    assert s.relief == 30.0 and s.share_under_5 == 0.5 and s.share_under_15 == 0.75
    mask = terrain.cell_mask(np.array([1.0, -1.0]), np.array([-1.0, 1.0]), 0, 0, 2, 2)
    assert mask.tolist() == [[False, True], [False, False]]
    assert terrain.stats(dem, slope, mask).elevation_mean == 10.0
    with pytest.raises(ValueError):
        terrain.stats(dem, slope, np.zeros_like(mask))


def test_hillshade_lights_slopes_facing_the_sun():
    """Ground rising to the east faces west: an evening (western) sun lights it best."""
    dem = np.tile(np.arange(16.0) * 10.0, (16, 1))
    west = terrain.hillshade(dem, 30.0, azimuth=270.0, altitude=30.0)[8, 8]
    east = terrain.hillshade(dem, 30.0, azimuth=90.0, altitude=30.0)[8, 8]
    flat = terrain.hillshade(np.zeros((16, 16)), 30.0, altitude=30.0)[8, 8]
    assert west > flat > east
    assert flat == pytest.approx(math.sin(math.radians(30.0)))
