"""Offline place names for scored grid cells.

Two independent layers are combined, both loaded from disk so labelling is
reproducible and never reaches the network:

1. ``data/gazetteer.json`` - a hand-compiled list of coarse circular envelopes
   around well-known physiographic regions. Smallest envelope first. Labelling
   only; it has no effect on any score.
2. Natural Earth 10m Populated Places (public domain), cached under
   ``cache/raw`` - the nearest settlement is used when no region envelope
   contains the cell.

Distance is the great-circle distance on a sphere of radius 6371.0088 km.
"""

from __future__ import annotations

import json
import math
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

from src.acquire.download import REPO_ROOT, fetch

PLACES_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_10m_populated_places_simple.geojson"
)
PLACES_FILENAME = "ne_10m_populated_places_simple.geojson"
REGIONS_PATH = REPO_ROOT / "data" / "gazetteer.json"
EARTH_RADIUS_KM = 6371.0088

SOURCE_PLACES = "Natural Earth 10m Populated Places (public domain)"
SOURCE_REGIONS = "hand-compiled physiographic envelopes, data/gazetteer.json"


class GazetteerError(RuntimeError):
    """Raised when the place name index cannot be built."""


@dataclass(frozen=True)
class Place:
    name: str
    country: str
    lat: float
    lon: float
    population: int
    feature: str


@dataclass(frozen=True)
class Region:
    name: str
    kind: str
    lat: float
    lon: float
    radius_km: float


@dataclass(frozen=True)
class Label:
    """Human-readable name for one grid cell."""

    text: str
    kind: str
    region: str | None
    place: str | None
    country: str | None
    distance_km: float
    source: str

    def as_dict(self) -> dict[str, object]:
        return {
            "text": self.text,
            "kind": self.kind,
            "region": self.region,
            "place": self.place,
            "country": self.country,
            "distance_km": round(self.distance_km, 1),
            "source": self.source,
        }


def _to_xyz(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    lat_r = np.radians(np.asarray(lat, dtype=np.float64))
    lon_r = np.radians(np.asarray(lon, dtype=np.float64))
    cos_lat = np.cos(lat_r)
    return np.stack((cos_lat * np.cos(lon_r), cos_lat * np.sin(lon_r), np.sin(lat_r)), axis=-1)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points on a sphere."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2.0 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


class Gazetteer:
    """Deterministic nearest-place lookup over a fixed local index."""

    def __init__(self, places: Sequence[Place], regions: Sequence[Region]):
        if not places:
            raise GazetteerError("place index is empty")
        self.places: tuple[Place, ...] = tuple(places)
        self.regions: tuple[Region, ...] = tuple(
            sorted(regions, key=lambda item: (item.radius_km, item.name))
        )
        lat = np.array([p.lat for p in self.places], dtype=np.float64)
        lon = np.array([p.lon for p in self.places], dtype=np.float64)
        self._xyz = _to_xyz(lat, lon)
        self._tree = cKDTree(self._xyz)

    # -- construction ----------------------------------------------------

    @classmethod
    def load(
        cls,
        regions_path: str | Path | None = None,
        places_path: str | Path | None = None,
        offline: bool | None = None,
    ) -> Gazetteer:
        regions_file = Path(regions_path) if regions_path else REGIONS_PATH
        if regions_file.exists():
            raw = json.loads(regions_file.read_text(encoding="utf-8"))
            regions = [
                Region(
                    name=str(entry["name"]),
                    kind=str(entry["kind"]),
                    lat=float(entry["lat"]),
                    lon=float(entry["lon"]),
                    radius_km=float(entry["radius_km"]),
                )
                for entry in raw.get("regions", [])
            ]
        else:
            regions = []

        if places_path is not None:
            geo = json.loads(Path(places_path).read_text(encoding="utf-8"))
        else:
            item = fetch(PLACES_URL, filename=PLACES_FILENAME, offline=offline)
            geo = json.loads(item.path.read_text(encoding="utf-8"))

        places: list[Place] = []
        for feature in geo.get("features", []):
            props = feature.get("properties", {})
            coords = feature.get("geometry", {}).get("coordinates") or []
            name = props.get("name") or props.get("nameascii")
            if not name or len(coords) < 2:
                continue
            places.append(
                Place(
                    name=str(name),
                    country=str(props.get("adm0name") or props.get("adm0_a3") or ""),
                    lat=float(coords[1]),
                    lon=float(coords[0]),
                    population=int(props.get("pop_max") or 0),
                    feature=str(props.get("featurecla") or ""),
                )
            )
        return cls(places, regions)

    # -- lookup ----------------------------------------------------------

    def nearest(self, lat: float, lon: float, k: int = 1) -> list[tuple[Place, float]]:
        """The *k* closest indexed places with their great-circle distance."""
        query = _to_xyz(np.array([lat]), np.array([lon]))[0]
        count = min(int(k), len(self.places))
        _, index = self._tree.query(query, k=count)
        flat = np.atleast_1d(index)
        return [
            (
                self.places[int(i)],
                haversine_km(lat, lon, self.places[int(i)].lat, self.places[int(i)].lon),
            )
            for i in flat
        ]

    def containing_region(self, lat: float, lon: float) -> Region | None:
        for region in self.regions:
            if haversine_km(lat, lon, region.lat, region.lon) <= region.radius_km:
                return region
        return None

    def label(self, lat: float, lon: float, max_distance_km: float = 400.0) -> Label:
        """Name one coordinate without ever touching the network."""
        region = self.containing_region(lat, lon)
        place, distance = self.nearest(lat, lon, 1)[0]

        if region is not None:
            text = region.name
            kind = "region"
            source = f"{SOURCE_REGIONS}; nearest place: {SOURCE_PLACES}"
        elif distance <= max_distance_km:
            text = f"near {place.name}"
            if place.country:
                text = f"{text}, {place.country}"
            kind = "town"
            source = SOURCE_PLACES
        else:
            text = f"remote, nearest {place.name}"
            kind = "open"
            source = SOURCE_PLACES

        return Label(
            text=text,
            kind=kind,
            region=region.name if region else None,
            place=place.name,
            country=place.country or None,
            distance_km=distance,
            source=source,
        )


_DEFAULT: Gazetteer | None = None


def default_gazetteer(offline: bool | None = None) -> Gazetteer:
    """Process-wide singleton so repeated API calls do not reparse 5 MB."""
    global _DEFAULT
    if _DEFAULT is None:
        _DEFAULT = Gazetteer.load(offline=offline)
    return _DEFAULT
