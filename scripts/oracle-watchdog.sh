#!/usr/bin/env bash
# Cron-friendly: restart butler-api when health stops responding (hung Node on :3001).
# Install: (crontab -l 2>/dev/null; echo "*/2 * * * * $HOME/agent/scripts/oracle-watchdog.sh >> /tmp/butler-watchdog.log 2>&1") | crontab -
set -euo pipefail

PUBLIC_IP="${BUTLER_PUBLIC_IP:-129.151.164.101}"

local_ok=false
public_ok=false
if curl -sf --max-time 4 http://127.0.0.1:3001/api/health | grep -q '"ok":true'; then
  local_ok=true
fi
if curl -sf --max-time 6 "http://${PUBLIC_IP}:3001/api/health" | grep -q '"ok":true'; then
  public_ok=true
fi

if [[ "$local_ok" == true && "$public_ok" == true ]]; then
  exit 0
fi

if [[ "$local_ok" == true && "$public_ok" != true ]]; then
  echo "$(date -Is) local ok, public fail — opening :3001 and restarting"
  if command -v iptables >/dev/null 2>&1; then
    sudo iptables -I INPUT -p tcp --dport 3001 -j ACCEPT 2>/dev/null || true
  fi
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
