#!/usr/bin/env bash
# Run from apps/web (Vercel root) or repo root — always installs monorepo web workspace.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
npm install -w @butler/web
