#!/usr/bin/env python3
"""Download npm packages via curl (npm registry often times out) then npm install."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / ".vendor"
REGISTRY = "https://registry.npmjs.org"
CURL = ["curl", "-fsSL", "--retry", "5", "--retry-delay", "3", "--max-time", "300"]

PACKAGES = [
    "@circle-fin/x402-batching",
    "@x402/core",
    "@x402/evm",
    "viem",
    "express",
    "cors",
    "dotenv",
    "typescript",
    "tsx",
    "@types/node",
    "@types/cors",
    "@types/express",
    "react",
    "react-dom",
    "vite",
    "@vitejs/plugin-react",
    "@types/react",
    "@types/react-dom",
    "esbuild",
    "rollup",
    "@rolldown/pluginutils",
    "postcss",
    "picocolors",
    "fdir",
    "tinyglobby",
    "nanoid",
    "source-map-js",
    "react-refresh",
    "@babel/core",
    "@babel/parser",
    "@babel/types",
    "semver",
    "debug",
    "ms",
    "depd",
    "etag",
    "fresh",
    "parseurl",
    "range-parser",
    "send",
    "serve-static",
    "statuses",
    "type-is",
    "vary",
    "accepts",
    "body-parser",
    "content-disposition",
    "content-type",
    "cookie",
    "cookie-signature",
    "encodeurl",
    "escape-html",
    "finalhandler",
    "http-errors",
    "merge-descriptors",
    "mime-types",
    "on-finished",
    "once",
    "proxy-addr",
    "qs",
    "router",
    "setprototypeof",
    "toidentifier",
    "wrappy",
    "inherits",
    "ee-first",
    "unpipe",
    "raw-body",
    "bytes",
    "iconv-lite",
    "safer-buffer",
    "mime-db",
    "negotiator",
    "forwarded",
    "ipaddr.js",
    "is-promise",
    "path-to-regexp",
    "media-typer",
    "object-inspect",
    "side-channel",
    "get-intrinsic",
    "call-bind-apply-helpers",
    "es-errors",
    "has-symbols",
    "get-proto",
    "dunder-proto",
    "gopd",
    "es-define-property",
    "es-object-atoms",
    "function-bind",
    "hasown",
    "math-intrinsics",
    "side-channel-list",
    "side-channel-map",
    "side-channel-weakmap",
    "call-bound",
]


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "butler-install/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def tarball_name(pkg: str, version: str) -> str:
    base = pkg.replace("@", "").replace("/", "-")
    return f"{base}-{version}.tgz"


def download_pkg(pkg: str) -> Path | None:
    encoded = urllib.parse.quote(pkg, safe="")
    try:
        meta = fetch_json(f"{REGISTRY}/{encoded}")
    except Exception as e:
        print(f"  WARN metadata {pkg}: {e}")
        return None

    version = meta.get("dist-tags", {}).get("latest")
    if not version or version not in meta.get("versions", {}):
        print(f"  WARN no version for {pkg}")
        return None

    name = tarball_name(pkg, version)
    dest = VENDOR / name
    if dest.exists() and dest.stat().st_size > 100:
        print(f"  cached {pkg}@{version}")
        return dest

    tarball_url = meta["versions"][version]["dist"]["tarball"]
    print(f"  download {pkg}@{version}")
    VENDOR.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp")
    for attempt in range(3):
        r = subprocess.run([*CURL, tarball_url, "-o", str(tmp)], capture_output=True)
        if r.returncode == 0 and tmp.stat().st_size > 100:
            tmp.rename(dest)
            return dest
        print(f"    retry {attempt + 1}/3")
        time.sleep(2)
    print(f"  FAIL {pkg}")
    return None


def cache_add(path: Path) -> None:
    subprocess.run(["npm", "cache", "add", str(path)], cwd=ROOT, check=False, capture_output=True)


def main() -> int:
    print("==> Butler dependency installer")
    VENDOR.mkdir(parents=True, exist_ok=True)

    # Pin x402 tarball for offline file: fallback
    x402 = download_pkg("@circle-fin/x402-batching")
    if x402:
        vendor_x402 = VENDOR / "x402-batching.tgz"
        if not vendor_x402.exists():
            import shutil
            shutil.copy(x402, vendor_x402)

    ok = 0
    for pkg in PACKAGES:
        tgz = download_pkg(pkg)
        if tgz:
            cache_add(tgz)
            ok += 1

    print(f"==> Cached {ok}/{len(PACKAGES)} packages")
    print("==> npm install")
    env = {**os.environ, "npm_config_fetch_timeout": "300000", "npm_config_fetch_retries": "5"}
    r = subprocess.run(
        ["npm", "install", "--prefer-offline", "--maxsockets", "2"],
        cwd=ROOT,
        env=env,
    )
    if r.returncode != 0:
        print("==> Retrying with vendor x402 file reference")
        for pkg_json in [ROOT / "apps/api/package.json", ROOT / "apps/agent/package.json"]:
            text = pkg_json.read_text()
            if "file:/tmp/" in text:
                pkg_json.write_text(
                    text.replace(
                        '"@circle-fin/x402-batching": "file:/tmp/x402-batching.tgz"',
                        '"@circle-fin/x402-batching": "file:.vendor/x402-batching.tgz"',
                    )
                )
        r = subprocess.run(["npm", "install", "--prefer-offline"], cwd=ROOT, env=env)

    if r.returncode == 0:
        print("==> Done")
        return 0
    print("==> npm install failed", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
