#!/usr/bin/env bash
# Provision ephemeral PR preview resources (ADR 0006 / ticket #18).
# Requires CLOUDFLARE_PREVIEW_API_TOKEN + CLOUDFLARE_PREVIEW_ACCOUNT_ID.
# No-ops with exit 0 when secrets are absent (structurally complete for CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PR_NUMBER="${PR_NUMBER:-${GITHUB_EVENT_PULL_REQUEST_NUMBER:-0}}"
WORKER_NAME="homedesign-pr-${PR_NUMBER}"

if [[ -z "${CLOUDFLARE_PREVIEW_API_TOKEN:-}" || -z "${CLOUDFLARE_PREVIEW_ACCOUNT_ID:-}" ]]; then
  echo "SKIP: CLOUDFLARE_PREVIEW_API_TOKEN / CLOUDFLARE_PREVIEW_ACCOUNT_ID not set — preview provision no-op"
  exit 0
fi

if [[ "$PR_NUMBER" == "0" ]]; then
  echo "SKIP: PR_NUMBER not set"
  exit 0
fi

export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_PREVIEW_API_TOKEN"
export CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_PREVIEW_ACCOUNT_ID"

echo "==> Provisioning PR #${PR_NUMBER} resources in preview account"

DB_NAME="hd-pr-${PR_NUMBER}"
npx wrangler d1 create "$DB_NAME" --location=apac || true
DB_ID=$(npx wrangler d1 list --json | node -e "
  const pr='${PR_NUMBER}';
  const rows=JSON.parse(require('fs').readFileSync(0,'utf8'));
  const row=rows.find(r=>r.name==='hd-pr-'+pr);
  if(row) process.stdout.write(row.uuid);
")

for suffix in private public next-cache; do
  npx wrangler r2 bucket create "hd-pr-${PR_NUMBER}-${suffix}" || true
done

npx wrangler queues create "hd-pr-${PR_NUMBER}-asset-validate" || true
npx wrangler queues create "hd-pr-${PR_NUMBER}-asset-validate-dlq" || true
npx wrangler queues create "hd-pr-${PR_NUMBER}-provider-notify" || true

echo "==> Applying migrations"
npx wrangler d1 migrations apply "$DB_NAME" --remote

echo "==> Seeding synthetic fixtures"
node scripts/seed-smoke.mjs

echo "==> Building + deploying Worker ${WORKER_NAME}"
npm run build:worker
# Deploy uses preview env; resource IDs recorded for destroy/janitor.
npx wrangler deploy --env preview --name "$WORKER_NAME" \
  --var "ENVIRONMENT:preview" \
  --var "PREVIEW_PR:${PR_NUMBER}"

mkdir -p .preview-state
cat > ".preview-state/pr-${PR_NUMBER}.json" <<EOF
{"pr":${PR_NUMBER},"worker":"${WORKER_NAME}","database":"${DB_NAME}","database_id":"${DB_ID}","created_at":$(date +%s)}
EOF

echo "OK: preview provisioned for PR #${PR_NUMBER}"
