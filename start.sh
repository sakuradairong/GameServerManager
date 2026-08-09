#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ ! -d node_modules ]]; then
  echo "[gsm4] installing dependencies..."
  npm install
fi

if [[ ! -f apps/web/dist/index.html || ! -d apps/server/dist ]]; then
  echo "[gsm4] building..."
  npm run build
fi

export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3001}"

echo "[gsm4] starting on port ${PORT}"
echo "[gsm4] open http://127.0.0.1:${PORT}"
npm run start
