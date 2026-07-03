#!/usr/bin/env bash
# Install Circle CLI for API login/payments. Used on Render and local setup.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

vendor_cli="$ROOT/.vendor/circle-cli/dist/index.js"
vendor_nm="$ROOT/.vendor/circle-cli/node_modules"
npm_cli="$ROOT/node_modules/@circle-fin/cli/dist/index.js"
npm_nm="$ROOT/node_modules"
if [[ ! -f "$npm_cli" ]]; then
  npm_cli="$ROOT/apps/api/node_modules/@circle-fin/cli/dist/index.js"
  npm_nm="$ROOT/apps/api/node_modules"
fi
global_cli="$ROOT/.circle-cli-global/node_modules/@circle-fin/cli/dist/index.js"
global_nm="$ROOT/.circle-cli-global/node_modules"

cli_smoke() {
  local js="$1"
  local nm="$2"
  [[ -f "$js" ]] || return 1
  NODE_PATH="$nm${NODE_PATH:+:$NODE_PATH}" node "$js" --version >/dev/null 2>&1
}

if [[ -f "$npm_cli" ]] && cli_smoke "$npm_cli" "$npm_nm"; then
  echo "==> Circle CLI ready (npm dependency)"
  exit 0
fi

if [[ -f "$vendor_cli" ]] && cli_smoke "$vendor_cli" "$vendor_nm"; then
  echo "==> Circle CLI ready (vendor)"
  exit 0
fi

if [[ -f "$global_cli" ]] && cli_smoke "$global_cli" "$global_nm"; then
  echo "==> Circle CLI ready (npm global)"
  exit 0
fi

echo "==> Circle CLI missing or broken — installing"

# npm install is more reliable on Render free tier than the full vendor tree.
if [[ "${RENDER:-}" == "true" ]]; then
  echo "==> Render: npm install @circle-fin/cli@0.0.5"
  mkdir -p "$ROOT/.circle-cli-global"
  npm install @circle-fin/cli@0.0.5 --prefix "$ROOT/.circle-cli-global" --omit=dev --no-audit --no-fund
  if [[ -f "$global_cli" ]] && cli_smoke "$global_cli" "$global_nm"; then
    echo "==> Circle CLI ready (npm on Render)"
    exit 0
  fi
fi

echo "==> Installing Circle CLI (vendor bundle)"
if python3 "$ROOT/scripts/install-circle-cli.py"; then
  if [[ -f "$vendor_cli" ]] && cli_smoke "$vendor_cli" "$vendor_nm"; then
    echo "==> Circle CLI ready (vendor install)"
    exit 0
  fi
  echo "WARN: vendor files present but CLI smoke test failed" >&2
fi

echo "==> Vendor install failed; trying npm fallback to .circle-cli-global"
mkdir -p "$ROOT/.circle-cli-global"
npm install @circle-fin/cli@0.0.5 --prefix "$ROOT/.circle-cli-global" --omit=dev --no-audit --no-fund

if [[ -f "$global_cli" ]] && cli_smoke "$global_cli" "$global_nm"; then
  echo "==> Circle CLI ready (npm fallback)"
  exit 0
fi

echo "FAIL: Circle CLI could not be installed or does not run" >&2
exit 1
