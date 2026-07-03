#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
RENDER_API="https://butler-api-x7lh.onrender.com"
# Vercel dashboard may still have VITE_API_URL=http://129.151.164.101:3001 (dead Oracle VM).
if [[ "${VITE_API_URL:-}" == *"129.151.164.101"* ]]; then
  echo "vercel-build: ignoring stale Oracle VM VITE_API_URL"
  unset VITE_API_URL
fi
# Call Render API directly — Vercel rewrites time out (~60s) on long sync login (async OTP is fine).
export VITE_API_URL="${VITE_API_URL:-${BUTLER_API_URL:-$RENDER_API}}"
echo "vercel-build: VITE_API_URL=${VITE_API_URL}"
npm run build -w @butler/web
