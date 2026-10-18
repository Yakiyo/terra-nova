"""Acquire locally hosted interface fonts and their redistribution licenses."""

import re
import shutil
import zipfile
from pathlib import Path

from src.acquire.download import fetch


def main():
    destination = Path("web/vendor/fonts")
    cache = Path("cache/vendor/interface-fonts")
    items = [
        (
            "https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf",
            "anton-regular.ttf",
        ),
        ("https://raw.githubusercontent.com/google/fonts/main/ofl/anton/OFL.txt", "anton-OFL.txt"),
        (
            "https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto%5Bwdth,wght%5D.ttf",
            "roboto-variable.ttf",
        ),
        (
            "https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/OFL.txt",
            "roboto-OFL.txt",
        ),
    ]
    for url, name in items:
        result = fetch(url, filename=name, raw_dir=cache)
        shutil.copyfile(result.path, destination / name)
        print(name, "cached" if result.from_cache else "downloaded")
    css = fetch(
        "https://api.fontshare.com/v2/css?f[]=panchang@600,700&display=swap",
        filename="panchang.css",
        raw_dir=cache,
    )
    content = css.path.read_text(encoding="utf-8")
    for weight in (600, 700):
        block = next(
            block for block in content.split("@font-face") if f"font-weight: {weight}" in block
        )
        url = re.search(r"url\(['\"]?([^)'\"]+\.woff2)", block).group(1)
        if url.startswith("//"):
            url = "https:" + url
        name = f"panchang-{weight}.woff2"
        result = fetch(url, filename=name, raw_dir=cache)
        shutil.copyfile(result.path, destination / name)
        print(name, "cached" if result.from_cache else "downloaded")
    package = fetch(
        "https://api.fontshare.com/v2/fonts/download/panchang",
        filename="panchang.zip",
        raw_dir=cache,
    )
    with zipfile.ZipFile(package.path) as archive:
        for name in archive.namelist():
            if "license" in name.lower() and not name.endswith("/"):
                (destination / ("panchang-" + Path(name).name)).write_bytes(archive.read(name))


if __name__ == "__main__":
    main()
