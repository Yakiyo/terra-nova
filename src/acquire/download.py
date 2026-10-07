from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:  # verify TLS with the operating system's trust store when available
    import truststore

    truststore.inject_into_ssl()
except ImportError:  # pragma: no cover - falls back to Python's bundled CAs
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RAW_DIR = REPO_ROOT / "cache" / "raw"
USER_AGENT = "spaceapps-earth-analogue-finder/1.0 (+https://github.com)"


class FetchError(RuntimeError):
    """Raised when a required remote artefact cannot be obtained."""


def offline_mode(value: str | bool | None = None) -> bool:
    """True when the build must not touch the network."""
    if value is None:
        value = os.environ.get("OFFLINE", "0")
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def url_to_filename(url: str) -> str:
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:10]
    tail = url.split("?", 1)[0].rstrip("/").rsplit("/", 1)[-1] or "index"
    safe = "".join(ch if (ch.isalnum() or ch in "._-") else "_" for ch in tail)
    if len(safe) > 80:
        safe = safe[-80:]
    return f"{safe}.{digest}"


@dataclass(frozen=True)
class Fetched:
    path: Path
    url: str
    from_cache: bool
    bytes: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "path": str(self.path),
            "from_cache": self.from_cache,
            "bytes": self.bytes,
        }


def fetch(
    url: str,
    *,
    filename: str | None = None,
    raw_dir: str | Path | None = None,
    offline: bool | None = None,
    timeout: int = 180,
    force: bool = False,
    max_seconds: float | None = None,
) -> Fetched:
    """Return a local copy of *url*, caching it under ``cache/raw``.

    When ``OFFLINE=1`` no network request is attempted; a missing cache entry
    raises :class:`FetchError` so the build can fall back to bundled fixtures.

    ``timeout`` limits each connect/read; ``max_seconds`` limits the whole
    download, so a connection that trickles data forever still fails.
    """
    directory = Path(raw_dir) if raw_dir is not None else DEFAULT_RAW_DIR
    directory.mkdir(parents=True, exist_ok=True)
    name = filename or url_to_filename(url)
    dest = directory / name

    if dest.exists() and not force:
        return Fetched(dest, url, True, dest.stat().st_size)

    if offline_mode(offline):
        raise FetchError(
            f"OFFLINE=1 and {name!r} is not cached under {directory}. "
            f"Run once with network access to populate cache/raw."
        )

    tmp_fd, tmp_name = tempfile.mkstemp(dir=directory, prefix=".partial-")
    os.close(tmp_fd)
    tmp_path = Path(tmp_name)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with (
            urllib.request.urlopen(request, timeout=timeout) as response,
            open(tmp_path, "wb") as handle,
        ):
            if max_seconds is None:
                shutil.copyfileobj(response, handle)
            else:
                started = time.monotonic()
                # read1 returns what has arrived so far, so the deadline is checked
                # even when a server trickles a few bytes at a time.
                while chunk := response.read1(64 * 1024):
                    handle.write(chunk)
                    if time.monotonic() - started > max_seconds:
                        raise FetchError(f"took longer than {max_seconds:.0f} s")
        if tmp_path.stat().st_size == 0:
            raise FetchError(f"empty response for {url}")
        tmp_path.replace(dest)
    except (urllib.error.URLError, OSError, FetchError) as exc:
        tmp_path.unlink(missing_ok=True)
        raise FetchError(f"failed to download {url}: {exc}") from exc
    return Fetched(dest, url, False, dest.stat().st_size)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
