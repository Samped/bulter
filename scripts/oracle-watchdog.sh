#!/usr/bin/env bash
# Cron-friendly: restart butler-api when health stops responding (hung Node on :3001).
# Install: (crontab -l 2>/dev/null; echo "*/2 * * * * $HOME/agent/scripts/oracle-watchdog.sh >> /tmp/butler-watchdog.log 2>&1") | crontab -
set -euo pipefail

if curl -sf --max-time 4 http://127.0.0.1:3001/api/health | grep -q '"ok":true'; then
  exit 0
fi

echo "$(date -Is) health failed — restarting butler-api"
if command -v fuser >/dev/null 2>&1; then
  sudo fuser -k 3001/tcp 2>/dev/null || true
fi
if systemctl is-active --quiet butler-api 2>/dev/null; then
  sudo systemctl restart butler-api
else
  ROOT="${BUTLER_ROOT:-$HOME/agent}"
  cd "$ROOT"
  export BUTLER_LITE_API=true
  export BUTLER_ROOT="$ROOT"
  nohup node apps/api/dist/server.mjs >> /tmp/butler-api.log 2>&1 &
fi
