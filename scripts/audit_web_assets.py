"""Check literal local asset/module references without following dynamic API URLs."""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlsplit

WEB = Path(__file__).resolve().parents[1] / "web"
PATTERNS = (
    r"(?:src|href)\s*=\s*['\"]([^'\"]+)['\"]",
    r"(?:from\s+|import\s*)['\"](\./[^'\"]+)['\"]",
    r"url\(\s*['\"]?([^)'\"\s]+)",
)


def main() -> int:
    missing = []
    for source in WEB.iterdir():
        if source.suffix not in {".js", ".html", ".css"}:
            continue
        text = source.read_text(encoding="utf-8")
        for pattern in PATTERNS:
            for reference in re.findall(pattern, text):
                if any(token in reference for token in ("${", "<", " ")):
                    continue
                url = urlsplit(reference)
                if url.scheme or url.netloc or not url.path or url.path.startswith("/api/"):
                    continue
                target = WEB / url.path.lstrip("/")
                if not target.exists():
                    missing.append(f"{source.name}: {reference}")
    for item in missing:
        print(f"MISSING {item}")
    if not missing:
        print("All literal local web asset and module references resolve.")
    return bool(missing)


if __name__ == "__main__":
    raise SystemExit(main())
