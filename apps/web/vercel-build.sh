#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
RENDER_API="https://butler-api-x7lh.onrender.com"
# Always bake Render into prod builds — ignore stale Vercel dashboard env (Oracle VM, etc.).
if [[ "${VITE_API_URL:-}" != "$RENDER_API" && "${VITE_API_URL:-}" != "" ]]; then
  echo "vercel-build: replacing VITE_API_URL=${VITE_API_URL:-<empty>} with ${RENDER_API}"
fi
export VITE_API_URL="$RENDER_API"
echo "vercel-build: VITE_API_URL=${VITE_API_URL}"
npm run build -w @butler/web
