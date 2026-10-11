#!/usr/bin/env bash
# Run StudyBuddy locally (API + web) using variables from ./.env
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Missing .env - copy .env.example to .env and fill it in." >&2; exit 1; }
set -a; source .env; set +a
export LOCAL_STORAGE_DIR="${LOCAL_STORAGE_DIR:-$PWD/.local/storage}"
export VITE_AUTH_DRIVER="${AUTH_DRIVER:-}"

pnpm --filter @workspace/db run push

PORT="$API_PORT" pnpm --filter @workspace/api-server run dev &
API_PID=$!
trap 'kill $API_PID 2>/dev/null' EXIT

# Without sign-in, keep the web server on this machine only.
# "localhost" covers both 127.0.0.1 and ::1. 0.0.0.0 would open it to the network.
WEB_HOST=0.0.0.0
[ "${AUTH_DRIVER:-}" = local ] && WEB_HOST=localhost
PORT="$WEB_PORT" BASE_PATH=/ pnpm --filter @workspace/grounded-tutor exec vite --config vite.config.ts --host "$WEB_HOST"
