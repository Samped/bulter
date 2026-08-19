#!/usr/bin/env bash
# Render build — install API slice, bundle server + Circle CLI into dist/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node scripts/set-workspaces-render.js
npm install --omit=dev
npm install @circle-fin/cli@0.0.5 -w @butler/api --omit=dev --no-audit --no-fund
npm run build:render -w @butler/api

BUNDLED="$ROOT/apps/api/dist/circle-bundle/node_modules/@circle-fin/cli/dist/index.js"
if [[ ! -f "$BUNDLED" ]]; then
  echo "ERROR: bundled Circle CLI missing at $BUNDLED" >&2
  exit 1
fi
NODE_PATH="$ROOT/apps/api/dist/circle-bundle/node_modules" node "$BUNDLED" --version
echo "==> Circle CLI bundled in apps/api/dist/circle-bundle"

echo "==> Render build complete"
if [[ -f apps/api/dist/server.mjs ]]; then
  echo "dist/server.mjs present"
else
  echo "ERROR: dist/server.mjs missing" >&2
  exit 1
fi
