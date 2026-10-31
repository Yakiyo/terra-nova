"""The offline preparation command must prepare the sites Finder actually shows."""

import os

import fastapi.testclient
import pytest

from src.acquire import sitetiles
from src.api.main import UI_DEFAULTS


@pytest.mark.parametrize("available", [True, False])
def test_prefetch_uses_finder_filters_and_reports_missing_terrain(monkeypatch, available):
    monkeypatch.setenv("OFFLINE", "1")
    requests = []

    class Response:
        def __init__(self, body):
            self.body = body

        def json(self):
            return self.body

        def raise_for_status(self):
            pass

    class Client:
        def __init__(self, app):
            pass

        def get(self, url, params=None):
            assert os.environ["OFFLINE"] == "0"
            if url == "/api/targets":
                return Response({"targets": [{"id": "jezero_crater"}]})
            return Response({"imagery": {}} if available else {"detail": "download failed"})

        def post(self, url, json):
            requests.append(json)
            return Response({"results": [{"lat": 28.25, "lon": 63.25}]})

    monkeypatch.setattr(fastapi.testclient, "TestClient", Client)
    assert sitetiles.main(["--terrain-only"]) == (0 if available else 1)
    assert requests == [{**UI_DEFAULTS, "target_id": "jezero_crater"}]
    assert os.environ["OFFLINE"] == "1"
