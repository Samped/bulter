#!/usr/bin/env bash
# Start Butler API on Render / lite hosts. Prefer prebuilt dist (faster, less RAM than tsx).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${BUTLER_START_LOG:-/tmp/butler-api-start.log}"

export BUTLER_LITE_API="${BUTLER_LITE_API:-true}"
export BUTLER_ROOT="${BUTLER_ROOT:-$ROOT}"
export RENDER="${RENDER:-true}"
export PORT="${PORT:-3001}"
export BUTLER_INTERNAL_API_URL="${BUTLER_INTERNAL_API_URL:-http://127.0.0.1:${PORT}}"

log() { echo "$(date -Is) $*" | tee -a "$LOG"; }

log "Butler API start (ROOT=$ROOT, lite=${BUTLER_LITE_API}, render=${RENDER})"

# Smoke-check only — do not npm install at boot (OOM on 512MB free tier).
npm_cli="$ROOT/node_modules/@circle-fin/cli/dist/index.js"
npm_nm="$ROOT/node_modules"
if [[ ! -f "$npm_cli" ]]; then
  npm_cli="$ROOT/apps/api/node_modules/@circle-fin/cli/dist/index.js"
  npm_nm="$ROOT/apps/api/node_modules"
fi
if [[ -f "$npm_cli" ]] && NODE_PATH="$npm_nm" node "$npm_cli" --version >>"$LOG" 2>&1; then
  log "Circle CLI npm package OK"
else
  log "WARN: Circle CLI npm package missing or broken — redeploy required for login"
fi

DIST="$ROOT/apps/api/dist/server.mjs"
if [[ -f "$DIST" ]]; then
  log "exec node dist/server.mjs"
  cd "$ROOT/apps/api"
  exec node dist/server.mjs
fi

TSX="$ROOT/node_modules/tsx/dist/cli.mjs"
if [[ ! -f "$TSX" ]]; then
  TSX="$ROOT/apps/api/node_modules/tsx/dist/cli.mjs"
fi
if [[ ! -f "$TSX" ]]; then
  log "ERROR tsx not found and dist/server.mjs missing — run render-build.sh"
  exit 1
fi

# Best-effort bundle when dist missing
if (cd "$ROOT" && npm run build:render -w @butler/api >> "$LOG" 2>&1); then
  log "dist build OK"
  if [[ -f "$DIST" ]]; then
    cd "$ROOT/apps/api"
    exec node dist/server.mjs
  fi
else
  log "dist build failed — falling back to tsx (see $LOG)"
fi

cd "$ROOT/apps/api"
log "exec tsx src/server.ts"
exec node "$TSX" src/server.ts
