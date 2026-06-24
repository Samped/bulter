#!/usr/bin/env bash
# Vercel dashboard install — exclude API/agent apps that require gitignored .vendor tarballs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node <<'NODE'
const fs = require("fs");
const path = "package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
pkg.workspaces = ["packages/*", "apps/web"];
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
NODE

npm install -w @butler/web
