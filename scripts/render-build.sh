#!/usr/bin/env bash
# Render build — install API slice, bundle server, verify Circle CLI npm package.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node scripts/set-workspaces-render.js
npm install --omit=dev
# Ensure Circle CLI is present (workspace hoisting can omit it on some npm versions).
npm install @circle-fin/cli@0.0.5 -w @butler/api --omit=dev --no-audit --no-fund
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
mkdir -p .data
printf '%s\n' "$npm_cli" > .data/circle-cli-js.path
printf '%s\n' "$npm_nm" > .data/circle-cli-nm.path
echo "==> Circle CLI ready (npm) → .data/circle-cli-*.path"

echo "==> Render build complete"
if [[ -f apps/api/dist/server.mjs ]]; then
  echo "dist/server.mjs present"
else
  echo "WARN: dist/server.mjs missing — lite VM will use tsx (OK for BUTLER_LITE_API=true)"
fi
