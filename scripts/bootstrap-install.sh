#!/usr/bin/env bash
# Bootstrap npm install when registry fetches time out via npm but work via curl.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/.vendor"
mkdir -p "$VENDOR"

fetch_pkg() {
  local name="$1"
  local encoded
  encoded=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$name")
  local meta ver url tgz
  meta=$(curl -fsSL --max-time 60 "https://registry.npmjs.org/${encoded}")
  ver=$(node -e "const j=JSON.parse(process.argv[1]); console.log(j['dist-tags'].latest)" "$meta")
  local base="${name#@}"
  base="${base//@/%40}"
  base="${base//\//-}"
  tgz="$VENDOR/${base}-${ver}.tgz"
  if [[ ! -f "$tgz" ]]; then
    url=$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.versions[process.argv[2]].dist.tarball)" "$meta" "$ver")
    echo "  download $name@$ver"
    curl -fsSL --max-time 120 "$url" -o "$tgz"
  else
    echo "  cached $name@$ver"
  fi
  npm cache add "$tgz" >/dev/null
}

echo "==> Seeding npm cache (curl transport)"
PKGS=(
  "@circle-fin/x402-batching"
  "@x402/core"
  "@x402/evm"
  "viem"
  "express"
  "cors"
  "dotenv"
  "typescript"
  "tsx"
  "@types/node"
  "@types/cors"
  "@types/express"
  "react"
  "react-dom"
  "vite"
  "@vitejs/plugin-react"
  "@types/react"
  "@types/react-dom"
)
for pkg in "${PKGS[@]}"; do
  fetch_pkg "$pkg" || echo "  WARN: failed $pkg"
done

echo "==> npm install (prefer offline)"
cd "$ROOT"
npm install --prefer-offline --maxsockets=2 --fetch-timeout=120000 --fetch-retries=3
echo "==> Done"
