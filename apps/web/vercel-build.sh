#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
# Same-origin /api/* is proxied by vercel.json — avoids mixed-content (HTTPS → HTTP).
export VITE_API_URL=""
npm run build -w @butler/web
