"""Consistency checks between independent datasets in the predictor stack.

If the inputs are sound, physically related quantities from *different*
sources must agree. Each check reports a rank correlation (Spearman rho) over
the land cells both datasets cover, and the direction physics predicts.
Deterministic; no model involved.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import numpy as np
from scipy.stats import spearmanr

CHECKS: tuple[dict[str, str], ...] = (
    {
        "id": "lst_vs_power",
        "a": "lst_modis",
        "b": "power_ts_range",
        "expect": "positive",
        "title": "MODIS day-night surface swing vs NASA POWER skin-temperature range",
        "why": "Two independent sources (satellite LST, MERRA-2 reanalysis) measure the same "
        "thing, so they should rank places alike. This agreement is what justifies filling "
        "MODIS gaps from POWER.",
    },
    {
        "id": "rain_vs_green",
        "a": "precipitation",
        "b": "vegetation",
        "expect": "positive",
        "title": "NASA POWER precipitation vs MODIS NDVI (GIBS)",
        "why": "Wetter land is greener. A different reanalysis and a different satellite must "
        "agree on where the dry, bare ground is.",
    },
    {
        "id": "lat_vs_seasonality",
        "a": "abs_latitude",
        "b": "annual_temperature_range",
        "expect": "positive",
        "title": "Distance from the equator vs annual temperature range",
        "why": "Seasons get stronger towards the poles. A basic sanity check of the "
        "temperature layer and of the grid geometry.",
    },
    {
        "id": "rough_vs_slope",
        "a": "roughness",
        "b": "slope",
        "expect": "positive",
        "title": "Terrain roughness vs regional slope",
        "why": "Both come from the same elevation tiles but are computed at different scales "
        "(28 km window vs 55 km gradient); mountains should score high on both.",
    },
)


def run(arrays: Mapping[str, np.ndarray], land: np.ndarray) -> list[dict[str, Any]]:
    """Spearman correlation for every check, over land cells where both inputs exist."""
    out = []
    for check in CHECKS:
        a = arrays[check["a"]]
        b = arrays[check["b"]]
        both = land & np.isfinite(a) & np.isfinite(b)
        n = int(both.sum())
        rho = float(spearmanr(a[both], b[both]).statistic) if n > 10 else float("nan")
        finite = bool(np.isfinite(rho))   # too few cells or constant input: no correlation
        passed = finite and ((rho > 0.3) if check["expect"] == "positive" else (rho < -0.3))
        out.append(
            {
                **check,
                "rho": round(rho, 3) if finite else None,
                "cells": n,
                "passed": bool(passed),
            }
        )
    return out
