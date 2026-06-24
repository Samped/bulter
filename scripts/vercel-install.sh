#!/usr/bin/env bash
# Vercel dashboard install — hide API/agent apps that need gitignored .vendor tarballs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

restore_hidden() {
  for hidden in apps/api.vercel-hide apps/agent.vercel-hide; do
    if [[ -d "$hidden" ]]; then
      mv "$hidden" "${hidden%.vercel-hide}"
    fi
  done
}
trap restore_hidden EXIT

for dir in apps/api apps/agent; do
  if [[ -d "$dir" ]]; then
    mv "$dir" "${dir}.vercel-hide"
  fi
done

node <<'NODE'
const fs = require("fs");
const path = "package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
pkg.workspaces = ["packages/core", "packages/arc", "apps/web"];
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
NODE

npm install -w @butler/web
