#!/usr/bin/env bash
# CI/POSIX entrypoint. Cross-platform implementation lives in smoke.mjs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

exec node scripts/smoke.mjs
