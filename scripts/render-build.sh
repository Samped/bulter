#!/usr/bin/env bash
# Render build — install API slice, bundle server, best-effort Circle CLI.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node scripts/set-workspaces-render.js
npm install --omit=dev
npm run build:render -w @butler/api || echo "WARN: dist build failed — lite API runs from tsx source"

echo "==> Installing Circle CLI (required for login)"
if bash scripts/ensure-circle-cli.sh; then
  echo "==> Circle CLI ready"
else
  echo "ERROR: Circle CLI install failed — login will not work" >&2
  exit 1
fi

echo "==> Render build complete"
if [[ -f apps/api/dist/server.mjs ]]; then
  echo "dist/server.mjs present"
else
  echo "WARN: dist/server.mjs missing — lite VM will use tsx (OK for BUTLER_LITE_API=true)"
fi
