#!/usr/bin/env bash
# Destroy ephemeral PR preview resources on PR close (ADR 0006 / ticket #18).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PR_NUMBER="${PR_NUMBER:-${GITHUB_EVENT_PULL_REQUEST_NUMBER:-0}}"

if [[ -z "${CLOUDFLARE_PREVIEW_API_TOKEN:-}" || -z "${CLOUDFLARE_PREVIEW_ACCOUNT_ID:-}" ]]; then
  echo "SKIP: preview destroy no-op (secrets absent)"
  exit 0
fi

if [[ "$PR_NUMBER" == "0" ]]; then
  echo "SKIP: PR_NUMBER not set"
  exit 0
fi

export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_PREVIEW_API_TOKEN"
export CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_PREVIEW_ACCOUNT_ID"

WORKER_NAME="homedesign-pr-${PR_NUMBER}"
DB_NAME="hd-pr-${PR_NUMBER}"

echo "==> Destroying PR #${PR_NUMBER} preview resources"
npx wrangler delete "$WORKER_NAME" --force || true
npx wrangler d1 delete "$DB_NAME" || true

for suffix in private public next-cache; do
  npx wrangler r2 bucket delete "hd-pr-${PR_NUMBER}-${suffix}" || true
done

npx wrangler queues delete "hd-pr-${PR_NUMBER}-asset-validate" || true
npx wrangler queues delete "hd-pr-${PR_NUMBER}-asset-validate-dlq" || true
npx wrangler queues delete "hd-pr-${PR_NUMBER}-provider-notify" || true

rm -f ".preview-state/pr-${PR_NUMBER}.json"
echo "OK: preview destroyed for PR #${PR_NUMBER}"
