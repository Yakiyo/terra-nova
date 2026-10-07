"""Check that this computer can reach every data host the app downloads from.

    python -m scripts.check_network

For each host it downloads one small, real tile and reports the time. A host
that is slow (over 5 s) or blocked explains a God's Eye view, hover preview or
zoomed map that never loads. Nothing is cached.
"""

from __future__ import annotations

import time
import urllib.request

from src.acquire import download  # noqa: F401  (installs the OS trust store for TLS)
from src.acquire.download import USER_AGENT

CHECKS = [
    (
        "AWS Terrain Tiles (God's Eye elevation)",
        "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/10/700/400.png",
    ),
    (
        "EOX Sentinel-2 (God's Eye imagery, 3D previews)",
        "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/9/200/350.jpg",
    ),
    (
        "NASA GIBS (zoom tiles, previews, latest image)",
        "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_NextGeneration&STYLES=&CRS=EPSG:4326&BBOX=0,0,2,2&WIDTH=64&HEIGHT=64&FORMAT=image/jpeg",
    ),
    (
        "NASA POWER (data rebuilds only)",
        "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M&community=RE&latitude=0&longitude=0&format=JSON",
    ),
]


def main() -> int:
    worst = 0
    for name, url in CHECKS:
        started = time.monotonic()
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=20) as response:
                size = len(response.read())
            seconds = time.monotonic() - started
            verdict = "OK" if seconds < 5 else "SLOW"
            worst = max(worst, 0 if verdict == "OK" else 1)
            print(f"{verdict:5s} {seconds:5.1f} s  {size / 1024:6.1f} KB  {name}")
        except Exception as exc:
            worst = 2
            print(f"FAIL  {time.monotonic() - started:5.1f} s            {name}: {exc}")
    if worst:
        print(
            "\nA slow or failed host will make those views hang or fail. Fix: copy the cache "
            "folders (cache/sitetiles, cache/peek, cache/tiles) from a prepared laptop and "
            "run the app with OFFLINE=1, or prefetch on a better connection."
        )
    else:
        print("\nAll hosts reachable.")
    return worst


if __name__ == "__main__":
    raise SystemExit(main())
