#!/usr/bin/env bash
# Quick check after deploy — run on the VM (use 127.0.0.1, not public IP).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== build stamp (optional dist) ==="
cat apps/api/dist/build-stamp.json 2>/dev/null || echo "dist bundle not built — lite mode uses tsx source"

echo ""
echo "=== local health (expect ledgerVersion: 2) ==="
health=$(curl -sf --max-time 8 http://127.0.0.1:3001/api/health || true)
echo "$health" | python3 -m json.tool 2>/dev/null || echo "$health"

echo ""
echo "=== local ledger ==="
curl -sf --max-time 15 http://127.0.0.1:3001/api/ledger | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('totalCount', d.get('totalCount'))
print('meta', d.get('meta'))
print('sample records', len(d.get('records', [])))
" 2>/dev/null || echo "ledger unreachable"
