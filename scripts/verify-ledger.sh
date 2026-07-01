#!/usr/bin/env bash
# Quick check after deploy — run on the VM (use 127.0.0.1, not public IP).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== build stamp (optional dist) ==="
cat apps/api/dist/build-stamp.json 2>/dev/null || echo "dist bundle not built — lite mode uses tsx source"

echo ""
echo "=== local health (expect ledgerVersion: 4) ==="
health=$(curl -sf --max-time 8 http://127.0.0.1:3001/api/health || true)
echo "$health" | python3 -m json.tool 2>/dev/null || echo "$health"

echo ""
echo "=== local ledger (core route — should not 404) ==="
code=$(curl -sS -o /tmp/butler-ledger.json -w "%{http_code}" --max-time 60 http://127.0.0.1:3001/api/ledger || echo "000")
echo "HTTP $code"
if [[ "$code" != "200" ]]; then
  head -c 400 /tmp/butler-ledger.json 2>/dev/null || true
  echo ""
  exit 1
fi
python3 -c "
import json
d = json.load(open('/tmp/butler-ledger.json'))
if d.get('error'):
    raise SystemExit('ERROR ' + str(d.get('error')))
print('totalCount', d.get('totalCount'))
print('meta', d.get('meta'))
print('records returned', len(d.get('records', [])))
"
