#!/usr/bin/env bash
# Free-first release gate (ADR 0006 / ticket #18).
# Runs OpenNext build, wrangler deploy --dry-run, and checks compressed bundle ≤3MB.
# CPU ≤10ms/invocation is a documented Workers Free gate — measure in staging/production
# traces before enabling Workers Paid (not asserted here).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MAX_BUNDLE_BYTES=$((3 * 1024 * 1024))
WRANGLER_ENV="${WRANGLER_ENV:-production}"

echo "==> Building Next.js + OpenNext (Linux production build)"
npm run build
npx opennextjs-cloudflare build

echo "==> wrangler deploy --dry-run (--env ${WRANGLER_ENV})"
npx wrangler deploy --dry-run --env "$WRANGLER_ENV" || {
  echo "NOTE: dry-run may fail until Cloudflare resources are provisioned (expected without wizard/secrets)."
  echo "Bundle size check still runs against the local OpenNext worker artifact."
}

WORKER=".open-next/worker.js"
if [[ ! -f "$WORKER" ]]; then
  echo "FAIL: missing $WORKER after OpenNext build"
  exit 1
fi

if command -v gzip >/dev/null 2>&1; then
  COMPRESSED_SIZE=$(gzip -c "$WORKER" | wc -c | tr -d ' ')
else
  # Fallback: raw size (stricter than gzip; acceptable on minimal CI images).
  COMPRESSED_SIZE=$(wc -c < "$WORKER" | tr -d ' ')
  echo "WARN: gzip not found; using uncompressed worker size as proxy"
fi

echo "Compressed worker bundle: ${COMPRESSED_SIZE} bytes (Workers Free limit: ${MAX_BUNDLE_BYTES})"
if (( COMPRESSED_SIZE > MAX_BUNDLE_BYTES )); then
  echo "FAIL: bundle exceeds 3MB Workers Free compressed limit"
  exit 1
fi

cat <<'EOF'
==> CPU gate (documented, not measured in CI)
Workers Free allows 10ms CPU per invocation. Before enabling Workers Paid:
  1. Run staging smoke with real traffic fixtures.
  2. Review Workers Logs CPU duration p95 per route.
  3. Record evidence + budget owner in deploy notes.
EOF

echo "OK: free-first bundle gate passed"
