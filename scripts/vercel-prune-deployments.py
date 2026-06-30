#!/usr/bin/env python3
"""Prune old Vercel production deployments (keeps newest READY deployment).

Usage:
  export VERCEL_TOKEN=...  # https://vercel.com/account/tokens
  python3 scripts/vercel-prune-deployments.py          # dry run
  NO_DRY_RUN=1 python3 scripts/vercel-prune-deployments.py
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

TOKEN = os.environ.get("VERCEL_TOKEN")
PROJECT = os.environ.get("VERCEL_PROJECT", "butler-api")
TEAM_ID = os.environ.get("VERCEL_TEAM_ID", "")
DRY_RUN = os.environ.get("NO_DRY_RUN", "") != "1"


def api(method: str, path: str, query: dict | None = None) -> dict:
    if not TOKEN:
        print("Set VERCEL_TOKEN from https://vercel.com/account/tokens", file=sys.stderr)
        sys.exit(1)
    q = dict(query or {})
    if TEAM_ID:
        q["teamId"] = TEAM_ID
    url = f"https://api.vercel.com{path}"
    if q:
        url += "?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(
        url,
        method=method,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def list_deployments(until: int | None = None) -> list[dict]:
    q: dict[str, str | int] = {"projectId": PROJECT, "limit": 100, "target": "production"}
    if until is not None:
        q["until"] = until
    data = api("GET", "/v6/deployments", q)
    return data.get("deployments") or []


def main() -> None:
    print(f"Project: {PROJECT} ({'DELETE' if not DRY_RUN else 'dry run'})")
    all_deps: list[dict] = []
    until: int | None = None
    for _ in range(50):
        batch = list_deployments(until)
        if not batch:
            break
        all_deps.extend(batch)
        if len(batch) < 100:
            break
        until = batch[-1].get("created")

    if not all_deps:
        print("No deployments found. Set VERCEL_PROJECT to your project id/slug from Vercel dashboard.")
        return

    # Newest first
    all_deps.sort(key=lambda d: d.get("created") or 0, reverse=True)
    keep = next((d for d in all_deps if d.get("readyState") == "READY"), all_deps[0])
    keep_id = keep.get("uid")
    print(f"KEEP: {keep.get('url')} ({keep_id})")

    deleted = 0
    for dep in all_deps:
        uid = dep.get("uid")
        if not uid or uid == keep_id:
            continue
        print(f"DELETE: {dep.get('url')} ({uid})")
        deleted += 1
        if not DRY_RUN:
            try:
                api("DELETE", f"/v13/deployments/{uid}")
            except urllib.error.HTTPError as e:
                print(f"  failed {uid}: {e}", file=sys.stderr)
            time.sleep(0.2)

    print(f"\n{'Deleted' if not DRY_RUN else 'Would delete'} {deleted} deployment(s).")
    if DRY_RUN:
        print("Run: NO_DRY_RUN=1 python3 scripts/vercel-prune-deployments.py")
    print("Also enable Deployment Retention in Vercel → Project → Settings.")


if __name__ == "__main__":
    main()
