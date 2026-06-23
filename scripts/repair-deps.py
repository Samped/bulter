#!/usr/bin/env python3
"""Repair empty/corrupt packages in node_modules (partial npm install fallout)."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NM = ROOT / "node_modules"
VENDOR = ROOT / ".vendor"
VENDOR.mkdir(exist_ok=True)

REQUIRED = [
    "browserslist",
    "nanoid",
    "postcss",
    "@babel/parser",
    "@esbuild/linux-x64",
    "source-map-js",
    "picocolors",
    "gensync",
    "convert-source-map",
    "json5",
    "semver",
    "jsesc",
]


def pkg_dir(name: str) -> Path:
    if name.startswith("@"):
        scope, pkg = name.split("/")
        return NM / scope / pkg
    return NM / name


def is_broken(path: Path) -> bool:
    if not path.is_dir():
        return True
    return not any(path.rglob("*.js"))


def fetch(name: str) -> None:
    enc = urllib.parse.quote(name, safe="")
    meta = json.loads(urllib.request.urlopen(f"https://registry.npmjs.org/{enc}", timeout=60).read())
    ver = meta["dist-tags"]["latest"]
    url = meta["versions"][ver]["dist"]["tarball"]
    safe = name.replace("@", "").replace("/", "-")
    tgz = VENDOR / f"{safe}-{ver}.tgz"
    if not tgz.exists() or tgz.stat().st_size < 100:
        print(f"  download {name}@{ver}")
        subprocess.run(["curl", "-fsSL", "--max-time", "120", url, "-o", str(tgz)], check=True)
    dest = pkg_dir(name)
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True, exist_ok=True)
    subprocess.run(["tar", "-xzf", str(tgz), "-C", str(dest), "--strip-components=1"], check=True)
    print(f"  fixed {name}")


def main() -> int:
    print("==> Repairing node_modules")
    for name in REQUIRED:
        dest = pkg_dir(name)
        if is_broken(dest):
            try:
                fetch(name)
            except Exception as exc:
                print(f"  FAIL {name}: {exc}", file=sys.stderr)
                return 1
        else:
            print(f"  ok {name}")
    print("==> Done — restart: npm run dev:web")
    return 0


if __name__ == "__main__":
    sys.exit(main())
