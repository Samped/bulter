#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

export BUTLER_LITE_API="${BUTLER_LITE_API:-true}"
export BUTLER_ROOT="${BUTLER_ROOT:-$ROOT}"

# systemd runs dist/server.mjs — git pull alone does NOT update behavior without rebuild.
echo "Building API bundle (check ledgerVersion via curl /api/health)…" >&2
(cd "$ROOT" && npm run build:render -w @butler/api)

cd "$ROOT/apps/api"
if [[ -f dist/server.mjs ]]; then
  exec node dist/server.mjs
fi

echo "WARN: dist/server.mjs missing — falling back to tsx" >&2
exec node "$ROOT/node_modules/tsx/dist/cli.mjs" src/server.ts
