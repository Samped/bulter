#!/usr/bin/env bash
# Install Circle CLI for API login/payments. Used on Render and local setup.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

vendor_cli="$ROOT/.vendor/circle-cli/dist/index.js"
global_cli="$ROOT/.circle-cli-global/node_modules/@circle-fin/cli/dist/index.js"

cli_files_present() {
  [[ -f "$vendor_cli" || -f "$global_cli" ]]
}

# Full `node … --version` loads the whole CLI graph — skip on small VMs (OOM during deploy).
optional_smoke() {
  if [[ "${BUTLER_SKIP_CLI_SMOKE:-}" == "1" ]]; then
    return 0
  fi
  bash "$ROOT/scripts/circle.sh" --version >/dev/null 2>&1
}

if cli_files_present; then
  echo "==> Circle CLI already present"
  if optional_smoke; then
    bash "$ROOT/scripts/circle.sh" --version 2>/dev/null || true
    exit 0
  fi
  if [[ "${BUTLER_SKIP_CLI_SMOKE:-}" == "1" ]]; then
    echo "==> Skipping CLI smoke test (BUTLER_SKIP_CLI_SMOKE)"
    exit 0
  fi
  echo "WARN: Circle CLI files exist but --version failed — reinstalling" >&2
fi

echo "==> Installing Circle CLI (vendor bundle)"
if python3 "$ROOT/scripts/install-circle-cli.py"; then
  echo "==> Circle CLI install complete (verified by installer)"
  exit 0
fi

echo "==> Vendor install failed; trying npm fallback to .circle-cli-global"
mkdir -p "$ROOT/.circle-cli-global"
npm install @circle-fin/cli@0.0.5 --prefix "$ROOT/.circle-cli-global" --omit=dev --no-audit --no-fund

if cli_files_present; then
  if optional_smoke; then
    bash "$ROOT/scripts/circle.sh" --version 2>/dev/null || true
  fi
  echo "==> Circle CLI ready (npm fallback)"
  exit 0
fi

echo "FAIL: Circle CLI could not be installed" >&2
exit 1
