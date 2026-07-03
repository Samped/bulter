#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
# Call Render API directly — Vercel rewrites time out (~60s) during Circle OTP send (sync init ~90–120s).
export VITE_API_URL="${VITE_API_URL:-${BUTLER_API_URL:-https://butler-api-x7lh.onrender.com}}"
npm run build -w @butler/web
