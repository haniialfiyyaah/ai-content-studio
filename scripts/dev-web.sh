#!/usr/bin/env bash
# Local Next.js boot that avoids macOS EMFILE (Watchpack "too many open files").
# Cursor/GUI sessions often inherit launchctl soft maxfiles=256.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/web"

# Raise per-process FD soft limit when the kernel allows it.
if ulimit -n 10240 2>/dev/null; then
  :
elif ulimit -n 4096 2>/dev/null; then
  :
fi

# Prefer polling over native FSEvents — fewer FDs on large monorepos.
export WATCHPACK_POLLING="${WATCHPACK_POLLING:-true}"
export CHOKIDAR_USEPOLLING="${CHOKIDAR_USEPOLLING:-true}"
export WATCHPACK_POLLING_INTERVAL="${WATCHPACK_POLLING_INTERVAL:-1000}"

exec pnpm exec next dev --webpack -H 127.0.0.1 -p "${PORT:-3000}"
