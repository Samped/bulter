#!/usr/bin/env bash
# Render build — install API slice, bundle server, best-effort Circle CLI.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node scripts/set-workspaces-render.js
npm install --omit=dev
npm run build:render -w @butler/api || echo "WARN: dist build failed — lite API runs from tsx source"

# Small VMs OOM if we boot Circle CLI twice during deploy; installer already runs --version once.
export BUTLER_SKIP_CLI_SMOKE=1
if bash scripts/ensure-circle-cli.sh; then
  echo "==> Circle CLI ready"
else
  echo "WARN: Circle CLI install failed — login may not work until fixed" >&2
fi

echo "==> Render build complete"
if [[ -f apps/api/dist/server.mjs ]]; then
  echo "dist/server.mjs present"
else
  echo "WARN: dist/server.mjs missing — lite VM will use tsx (OK for BUTLER_LITE_API=true)"
fi
