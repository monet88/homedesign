#!/usr/bin/env bash
# Smoke suite entrypoint (ticket #18): migrations → seed → workers-runtime tests.
# Local/miniflare path used in CI and staging workflow_dispatch when secrets exist.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Applying D1 migrations (local)"
npx wrangler d1 migrations apply homedesign --local

echo "==> Seeding smoke fixtures"
node scripts/seed-smoke.mjs

echo "==> Running workers-runtime integration suite"
if [[ "${SMOKE_SKIP_WRANGLER_TEST:-}" != "1" ]]; then
  npm run wrangler:test
else
  echo "SKIP wrangler:test (already ran in CI)"
fi

echo "OK: smoke suite passed"
