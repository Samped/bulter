#!/usr/bin/env bash
# Bootstrap Foundry libs for Butler contracts + delegation framework deploy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACTS="$ROOT/packages/contracts"
LIB="$CONTRACTS/lib"

if ! command -v forge >/dev/null 2>&1; then
  echo "Install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup"
  exit 1
fi

mkdir -p "$LIB"

if [[ ! -d "$LIB/forge-std" ]]; then
  echo "==> forge-std"
  git clone --depth 1 https://github.com/foundry-rs/forge-std.git "$LIB/forge-std"
fi

if [[ ! -d "$LIB/delegation-framework" ]]; then
  echo "==> delegation-framework v1.3.0"
  git clone --depth 1 --branch v1.3.0 https://github.com/MetaMask/delegation-framework.git "$LIB/delegation-framework"
fi

echo "✓ Foundry libs ready in packages/contracts/lib/"
