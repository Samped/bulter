#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
# Same-origin /api → Vercel rewrites to Oracle (avoids HTTPS→HTTP mixed content).
export VITE_API_URL=""
echo "vercel-build: VITE_API_URL=<empty> (same-origin proxy → Oracle)"
npm run build -w @butler/web
