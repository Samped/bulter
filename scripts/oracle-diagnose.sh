#!/usr/bin/env bash
# Run on the Oracle VM when getbutler.xyz/api 502 but localhost health works.
set -euo pipefail

ROOT="${BUTLER_ROOT:-$HOME/agent}"
PUBLIC_IP="${BUTLER_PUBLIC_IP:-129.151.164.101}"

echo "=== Butler API diagnose ==="
echo "Public IP: $PUBLIC_IP"
echo ""

echo "1. Process listening on :3001"
sudo ss -tlnp | grep ':3001' || echo "  (nothing on 3001)"
echo ""

echo "2. Local health (127.0.0.1)"
if curl -sf --max-time 5 http://127.0.0.1:3001/api/health; then
  echo ""
  echo "  OK — local"
else
  echo "  FAIL — local"
fi
echo ""

echo "3. Public health ($PUBLIC_IP — same path Vercel uses)"
if curl -sf --max-time 8 "http://${PUBLIC_IP}:3001/api/health"; then
  echo ""
  echo "  OK — public"
else
  echo "  FAIL — public (Vercel will 502 until this works)"
fi
echo ""

echo "4. iptables INPUT (first 15 rules)"
if command -v iptables >/dev/null 2>&1; then
  sudo iptables -L INPUT -n --line-numbers 2>/dev/null | head -20 || true
else
  echo "  (iptables not found)"
fi
echo ""

echo "5. butler-api status"
systemctl is-active butler-api 2>/dev/null || echo "  (no systemd unit)"
sudo journalctl -u butler-api -n 15 --no-pager 2>/dev/null || true
echo ""

echo "Fix if public FAIL:"
echo "  sudo iptables -I INPUT -p tcp --dport 3001 -j ACCEPT"
echo "  rm -f $ROOT/.data/circle-login-jobs/*.json"
echo "  sudo fuser -k 3001/tcp; sleep 2; sudo systemctl restart butler-api"
echo "  Oracle Console → VCN → Security List → Ingress: TCP 3001 from 0.0.0.0/0"
