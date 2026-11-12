"""The sites the Finder lists, for the offline prefetch scripts.

The web interface ranks each target with ``UI_DEFAULTS`` (new sites only, 800 km apart,
at most 2 per country) and the target's own default weights (``web/app.js``
``scoreRequest``). Prefetching anything else leaves the listed sites uncached offline.
"""

from __future__ import annotations

from typing import Any


def finder_requests(top: int = 20) -> list[dict[str, Any]]:
    """The /api/score body the Finder sends for each built-in target."""
    from fastapi.testclient import TestClient

    from src.api.main import UI_DEFAULTS, app

    client = TestClient(app)
    return [
        {**UI_DEFAULTS, "target_id": t["id"], "weights": t["default_weights"], "top_k": top}
        for t in client.get("/api/targets").json()["targets"]
    ]


def finder_sites(top: int = 20) -> list[tuple[float, float]]:
    """Cell centres (lat, lon) of every target's top ``top`` Finder results."""
    from fastapi.testclient import TestClient

    from src.api.main import app

    client = TestClient(app)
    points: set[tuple[float, float]] = set()
    for body in finder_requests(top):
        response = client.post("/api/score", json=body)
        response.raise_for_status()
        points |= {(r["lat"], r["lon"]) for r in response.json()["results"]}
    return sorted(points)
