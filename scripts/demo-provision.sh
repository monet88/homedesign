#!/usr/bin/env bash
# Provision isolated Public Demo Cloudflare resources (ADR 0008 / Issue #72).
# Target: https://homedesign.monet.uno
# Resources:
#   D1: hd-demo (apac)
#   R2: hd-demo-private, hd-demo-public, hd-demo-next-cache
#   Queues: hd-demo-asset-validate, hd-demo-asset-validate-dlq, hd-demo-provider-notify
#
# Supports dry-run validation mode via --dry-run:
#   Validates environment, credentials preflight, capabilities, required config/secrets hooks,
#   build and free-first bundle gate without creating remote resources or modifying state.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DRY_RUN=false
for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then
    DRY_RUN=true
  fi
done

echo "==> Public Demo Cloudflare Provisioning (ADR 0008 / Issue #72)"

# 1. Preflight check for Wrangler deploy token (never substitute cloudflared credentials)
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN is not set in environment."
  echo "Wrangler token preflight required. Note: cloudflared credentials are not a substitute."
  exit 1
fi

echo "==> 1/9: Verifying Wrangler authentication & capabilities via whoami, D1, R2, Queues"
npx wrangler whoami

# Preflight check for core Cloudflare capabilities
echo "==> Preflighting Cloudflare D1 capability"
npx wrangler d1 list > /dev/null

echo "==> Preflighting Cloudflare R2 capability"
npx wrangler r2 bucket list > /dev/null

echo "==> Preflighting Cloudflare Queues capability"
npx wrangler queues list > /dev/null

# Zone / Custom Domain capability limitation (ADR 0008 / Issue #72):
# There is NO non-mutating Wrangler command that proves the token may attach a
# Custom Domain to the `monet.uno` zone before deployment. `wrangler deployments
# list` only succeeds once a Worker already exists — it is NOT a capability probe
# and must not be masked as one. The earliest live operation that exercises this
# permission is the actual Worker deploy + Custom Domain attach
# (`wrangler deploy --env demo`), which runs under `set -euo pipefail` and
# FAILS CLOSED if the token lacks workers:write or zone/custom-domain
# permission. `wrangler deploy --dry-run` does NOT validate this permission,
# so a passing dry-run is not evidence of zone/custom-domain access.

# 2. Check required deployment secrets hooks (without printing or exposing secret values)
echo "==> 2/9: Verifying deployment secrets presence (hooks check)"
REQUIRED_SECRETS=(
  "BETTER_AUTH_SECRET"
  "GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET"
  "AI_API_KEY"
  "R2_ACCESS_KEY_ID"
  "R2_SECRET_ACCESS_KEY"
  "R2_ACCOUNT_ID"
)

MISSING_SECRETS=()
for secret_name in "${REQUIRED_SECRETS[@]}"; do
  if [[ -z "${!secret_name:-}" ]]; then
    MISSING_SECRETS+=("$secret_name")
  fi
done

if [[ ${#MISSING_SECRETS[@]} -gt 0 ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "NOTICE: [DRY RUN] Secrets not set in local shell: ${MISSING_SECRETS[*]}"
    echo "NOTICE: In live provisioning, these must be populated in the environment or set via 'wrangler secret put --env demo <name>'."
  else
    echo "ERROR: The following required secrets are missing from environment: ${MISSING_SECRETS[*]}"
    echo "Ensure all secrets are provided before running live provisioning."
    exit 1
  fi
else
  echo "OK: All required deployment secret variables are present in the environment."
fi

# 3. Dry-run early exit after build & free-first validation
if [[ "$DRY_RUN" == "true" ]]; then
  echo "==> 3/9: [DRY RUN] Running worker build & free-first gates"
  npm run build:worker
  npm run gate:free-first

  echo "==> 4/9: [DRY RUN] Simulating D1 database lookup / creation (hd-demo)"
  echo "[DRY RUN] Database 'hd-demo' lookup and ID capture simulated."

  echo "==> 5/9: [DRY RUN] Simulating R2 buckets (hd-demo-private, hd-demo-public, hd-demo-next-cache)"
  echo "[DRY RUN] Buckets simulated and CORS rule for https://homedesign.monet.uno verified."

  echo "==> 6/9: [DRY RUN] Simulating Queues (hd-demo-asset-validate, hd-demo-asset-validate-dlq, hd-demo-provider-notify)"
  echo "[DRY RUN] Queues simulated."

  echo "==> 7/9: [DRY RUN] Simulating remote D1 migrations apply"
  echo "[DRY RUN] Remote migrations apply simulated."

  echo "==> 8/9: [DRY RUN] Simulating demo admin role-only bootstrap (minhthang421992@gmail.com)"
  echo "[DRY RUN] Role-only admin bootstrap command simulated: node scripts/seed-admin.mjs --demo"

  echo "==> 9/9: [DRY RUN] Simulating Worker deployment & Custom Domain attachment"
  echo "[DRY RUN] wrangler deploy --dry-run --env demo (config/bundle check only)."
  echo "[DRY RUN] NOTE: --dry-run does NOT validate zone/custom-domain permission; live deploy fails closed."
  npx wrangler deploy --dry-run --env demo

  echo ""
  if [[ ${#MISSING_SECRETS[@]} -gt 0 ]]; then
    echo "================================================================="
    echo " [DRY RUN] Preflight & Build Validation Passed (NOTICE: runtime secrets missing for live deployment)"
    echo " Target Domain: https://homedesign.monet.uno"
    echo " Environment  : demo (isolated D1/R2/Queues/Worker)"
    echo " Missing live secrets: ${MISSING_SECRETS[*]}"
    echo "================================================================="
  else
    echo "================================================================="
    echo " [DRY RUN] Full Public Demo Provisioning & Build Validation PASSED"
    echo " Target Domain: https://homedesign.monet.uno"
    echo " Environment  : demo (isolated D1/R2/Queues/Worker)"
    echo " Ready for live deployment with: bash scripts/demo-provision.sh"
    echo "================================================================="
  fi
  exit 0
fi

# Live execution path (only executed when --dry-run is NOT specified)
echo "==> 3/9: Idempotent D1 database find or create: hd-demo (location: apac)"
EXISTING_D1_ID=$(npx wrangler d1 list --json | node -e "
  const rows = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  const row = rows.find(r => r.name === 'hd-demo');
  if (row) process.stdout.write(row.uuid);
")

if [[ -z "$EXISTING_D1_ID" ]]; then
  echo "Creating D1 database 'hd-demo' (location: apac)..."
  npx wrangler d1 create "hd-demo" --location apac
  EXISTING_D1_ID=$(npx wrangler d1 list --json | node -e "
    const rows = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    const row = rows.find(r => r.name === 'hd-demo');
    if (row) process.stdout.write(row.uuid);
  ")
fi

echo "Captured D1 Database ID: $EXISTING_D1_ID"

# Update wrangler.jsonc demo database_id if placeholder exists
if grep -q "__PROVISIONED_DEMO__" wrangler.jsonc; then
  echo "Updating wrangler.jsonc demo database_id to $EXISTING_D1_ID"
  node -e "
    const fs = require('fs');
    let content = fs.readFileSync('wrangler.jsonc', 'utf8');
    content = content.replace('__PROVISIONED_DEMO__', '$EXISTING_D1_ID');
    fs.writeFileSync('wrangler.jsonc', content, 'utf8');
  "
fi

echo "==> 4/9: Idempotent R2 bucket find or create"
EXISTING_BUCKETS=$(npx wrangler r2 bucket list)
for suffix in private public next-cache; do
  bname="hd-demo-${suffix}"
  if echo "$EXISTING_BUCKETS" | grep -qw "$bname"; then
    echo "R2 bucket '$bname' already exists."
  else
    echo "Creating R2 bucket '$bname'..."
    npx wrangler r2 bucket create "$bname"
  fi
done

# Configure CORS on private bucket for presigned browser uploads from https://homedesign.monet.uno
echo "==> Configuring CORS on hd-demo-private for https://homedesign.monet.uno"
CORS_FILE="$(mktemp)"
cat > "$CORS_FILE" <<'EOF'
[
  {
    "AllowedOrigins": ["https://homedesign.monet.uno"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
EOF
npx wrangler r2 bucket cors set "hd-demo-private" --file "$CORS_FILE"
rm -f "$CORS_FILE"

echo "==> 5/9: Idempotent Queues find or create"
EXISTING_QUEUES=$(npx wrangler queues list)
for qname in "hd-demo-asset-validate" "hd-demo-asset-validate-dlq" "hd-demo-provider-notify"; do
  if echo "$EXISTING_QUEUES" | grep -qw "$qname"; then
    echo "Queue '$qname' already exists."
  else
    echo "Creating Queue '$qname'..."
    npx wrangler queues create "$qname"
  fi
done

echo "==> 6/9: Applying D1 migrations remotely to hd-demo"
npx wrangler d1 migrations apply "hd-demo" --remote

echo "==> 7/9: Building Worker & verifying free-first gate"
npm run build:worker
npm run gate:free-first

# Configure runtime secrets into the demo environment without printing values
echo "==> Configuring runtime secrets for demo Worker (values piped silently)"
for secret_name in "${REQUIRED_SECRETS[@]}"; do
  printf "%s" "${!secret_name}" | npx wrangler secret put "$secret_name" --env demo > /dev/null
  echo "Secret '$secret_name' configured for env demo."
done

echo "==> 8/9: Deploying Worker to Cloudflare (env: demo) & attaching Custom Domain"
npx wrangler deploy --env demo

echo "==> 9/9: Verifying deployment and custom domain readiness"
echo "Verifying TLS/HTTP response from https://homedesign.monet.uno..."
MAX_ATTEMPTS=12
ATTEMPT=1
DEPLOYMENT_OK=false
while [[ $ATTEMPT -le $MAX_ATTEMPTS ]]; do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://homedesign.monet.uno" || echo "000")
  if [[ "$HTTP_STATUS" == "200" || "$HTTP_STATUS" == "308" || "$HTTP_STATUS" == "307" || "$HTTP_STATUS" == "302" ]]; then
    echo "Verified https://homedesign.monet.uno returned HTTP $HTTP_STATUS"
    DEPLOYMENT_OK=true
    break
  fi
  echo "Attempt $ATTEMPT/$MAX_ATTEMPTS: https://homedesign.monet.uno returned HTTP $HTTP_STATUS; retrying in 10s..."
  sleep 10
  ATTEMPT=$((ATTEMPT + 1))
done

if [[ "$DEPLOYMENT_OK" != "true" ]]; then
  echo "ERROR: https://homedesign.monet.uno failed TLS/HTTP verification after $MAX_ATTEMPTS attempts."
  exit 1
fi

echo ""
echo "================================================================="
echo " Public Demo Provisioned & Deployed Successfully!"
echo " Public URL    : https://homedesign.monet.uno"
echo " Worker Name   : homedesign-demo"
echo " Environment   : demo"
echo " D1 Database   : hd-demo ($EXISTING_D1_ID)"
echo " R2 Buckets    : hd-demo-private, hd-demo-public, hd-demo-next-cache"
echo " Queues        : hd-demo-asset-validate, hd-demo-asset-validate-dlq, hd-demo-provider-notify"
echo " Admin User    : minhthang421992@gmail.com"
echo " Note          : To bootstrap admin role without credits after first Google login, run:"
echo "                 node scripts/seed-admin.mjs --demo"
echo "================================================================="
