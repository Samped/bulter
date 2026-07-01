#!/usr/bin/env bash
# Start Butler API (lite VM). Run TypeScript source via tsx so git pull always applies —
# stale dist/server.mjs was causing missing ledger backfill when esbuild failed on the VM.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${BUTLER_START_LOG:-/tmp/butler-api-start.log}"

export BUTLER_LITE_API="${BUTLER_LITE_API:-true}"
export BUTLER_ROOT="${BUTLER_ROOT:-$ROOT}"

log() { echo "$(date -Is) $*" | tee -a "$LOG"; }

log "Butler API start (ROOT=$ROOT, lite=${BUTLER_LITE_API})"

TSX="$ROOT/node_modules/tsx/dist/cli.mjs"
if [[ ! -f "$TSX" ]]; then
  log "ERROR tsx not found — run: cd $ROOT && npm install --omit=dev"
  exit 1
fi

# Best-effort bundle for faster cold starts when esbuild works; never required in lite mode.
if (cd "$ROOT" && npm run build:render -w @butler/api >> "$LOG" 2>&1); then
  log "optional dist build OK"
else
  log "optional dist build failed (lite mode uses tsx — see $LOG)"
fi

cd "$ROOT/apps/api"
log "exec tsx src/server.ts"
exec node "$TSX" src/server.ts
