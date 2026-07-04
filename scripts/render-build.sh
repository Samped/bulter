#!/usr/bin/env bash
# Render build — install API slice, bundle server, verify Circle CLI npm package.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node scripts/set-workspaces-render.js
npm install --omit=dev
npm run build:render -w @butler/api || echo "WARN: dist build failed — lite API runs from tsx source"

echo "==> Verifying Circle CLI (npm dependency — no vendor install on Render)"
npm_cli="$ROOT/node_modules/@circle-fin/cli/dist/index.js"
npm_nm="$ROOT/node_modules"
if [[ ! -f "$npm_cli" ]]; then
  npm_cli="$ROOT/apps/api/node_modules/@circle-fin/cli/dist/index.js"
  npm_nm="$ROOT/apps/api/node_modules"
fi
if [[ ! -f "$npm_cli" ]]; then
  echo "ERROR: @circle-fin/cli missing after npm install" >&2
  exit 1
fi
NODE_PATH="$npm_nm" node "$npm_cli" --version
echo "==> Circle CLI ready (npm)"

echo "==> Render build complete"
if [[ -f apps/api/dist/server.mjs ]]; then
  echo "dist/server.mjs present"
else
  echo "WARN: dist/server.mjs missing — lite VM will use tsx (OK for BUTLER_LITE_API=true)"
fi
