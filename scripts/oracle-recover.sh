#!/usr/bin/env bash
# Run on the Oracle VM when getbutler.xyz/api times out or login verify hangs.
set -euo pipefail

echo "=== Butler API recovery ==="

# Open firewall (Oracle iptables often blocks 3001 after reboot)
if command -v iptables >/dev/null 2>&1; then
  sudo iptables -I INPUT -p tcp --dport 3001 -j ACCEPT 2>/dev/null || true
  sudo iptables -I INPUT -p tcp --dport 22 -j ACCEPT 2>/dev/null || true
fi

ROOT="${BUTLER_ROOT:-$HOME/agent}"
if [[ ! -d "$ROOT" ]]; then
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fi
cd "$ROOT"

echo "Pulling latest…"
git pull origin main

echo "Installing / building API…"
npm run install:render

echo "Restarting butler-api…"
if systemctl is-active --quiet butler-api 2>/dev/null; then
  sudo systemctl restart butler-api
else
  echo "No butler-api systemd unit — starting manually (Ctrl+C to stop)"
  export BUTLER_LITE_API=true
  export BUTLER_ROOT="$ROOT"
  node apps/api/dist/server.mjs &
  sleep 2
fi

echo "Waiting for health…"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf --max-time 3 http://127.0.0.1:3001/api/health | grep -q '"ok"'; then
    echo "OK — API is responding locally"
    curl -s http://127.0.0.1:3001/api/health
    echo ""
    exit 0
  fi
  sleep 2
done

echo "FAIL — API still not responding. Check logs:"
echo "  sudo journalctl -u butler-api -n 80 --no-pager"
exit 1
