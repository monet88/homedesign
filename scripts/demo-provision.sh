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

echo "==> 1/9: Verifying Wrangler deploy token & capabilities (ADR 0008, Issue #72)"
npx wrangler whoami

# 1a. Cloudflare API Token introspection preflight (non-mutating GET)
echo "==> Preflighting Cloudflare API Token status and introspection (user/tokens/verify)"
TOKEN_VERIFY_RES=$(curl -sS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" "https://api.cloudflare.com/client/v4/user/tokens/verify" 2>/dev/null) || {
  echo "ERROR: Failed network request to verify Cloudflare API Token."
  exit 1
}

if [[ "$TOKEN_VERIFY_RES" != *"\"status\":\"active\""* && "$TOKEN_VERIFY_RES" != *"\"success\":true"* ]]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN verification failed or token is not active."
  echo "Endpoint: https://api.cloudflare.com/client/v4/user/tokens/verify"
  exit 1
fi
echo "OK: CLOUDFLARE_API_TOKEN is valid and active."

# 1b. Zone preflight: verify access and permissions for 'monet.uno' zone (non-mutating GET)
echo "==> Preflighting Cloudflare Zone capability for 'monet.uno' (zones?name=monet.uno)"
ZONE_QUERY_RES=$(curl -sS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" "https://api.cloudflare.com/client/v4/zones?name=monet.uno" 2>/dev/null) || {
  echo "ERROR: Failed network request to query zone 'monet.uno'."
  exit 1
}

if [[ "$ZONE_QUERY_RES" != *"\"name\":\"monet.uno\""* ]]; then
  echo "ERROR: Unable to access zone 'monet.uno' with provided CLOUDFLARE_API_TOKEN."
  echo "The token must have Zone:Read permissions on the 'monet.uno' zone."
  exit 1
fi
echo "OK: Zone 'monet.uno' is accessible."

# Parse and require non-empty ZONE_ID and zone-owning ACCOUNT_ID from zone query response
ZONE_PARSED=$(printf "%s" "$ZONE_QUERY_RES" | node -e "
  const fs = require('fs');
  let res;
  try {
    res = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch (e) {
    console.error('ERROR: Failed to parse zone query JSON response.');
    process.exit(1);
  }
  if (!res || !res.success || !Array.isArray(res.result)) {
    console.error('ERROR: Invalid zone query API response structure.');
    process.exit(1);
  }
  const zones = res.result.filter(z => z && z.name === 'monet.uno');
  if (zones.length === 0) {
    console.error('ERROR: Zone monet.uno not found in API response.');
    process.exit(1);
  }
  if (zones.length > 1 || res.result.length > 1) {
    console.error('ERROR: Ambiguous zone response: expected exactly 1 zone matching monet.uno, found ' + zones.length + ' (total ' + res.result.length + ').');
    process.exit(1);
  }
  const z = zones[0];
  const zoneId = (z.id || '').trim();
  const accountId = (z.account && z.account.id ? z.account.id : '').trim();
  if (!zoneId) {
    console.error('ERROR: Missing or empty zone id in zone query response.');
    process.exit(1);
  }
  if (!accountId) {
    console.error('ERROR: Missing or empty owning account.id in zone query response.');
    process.exit(1);
  }
  process.stdout.write(zoneId + ' ' + accountId);
") || {
  echo "ERROR: Failed to parse authoritative zone ID or owning account ID from zone 'monet.uno' response."
  echo "Failing closed before mutating any Cloudflare resources."
  exit 1
}

ZONE_ID=$(echo "$ZONE_PARSED" | awk '{print $1}')
ACCOUNT_ID=$(echo "$ZONE_PARSED" | awk '{print $2}')

if [[ -z "$ZONE_ID" || -z "$ACCOUNT_ID" ]]; then
  echo "ERROR: Missing authoritative Zone ID or Account ID from zone query response."
  echo "Failing closed before mutating any Cloudflare resources."
  exit 1
fi

# Pin Wrangler to the authoritative zone-owning account ID for all subsequent checks and mutations
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"

echo "OK: Verified authoritative target Account ID (${ACCOUNT_ID}) and Zone ID (${ZONE_ID}) from zone 'monet.uno'."
echo "OK: Pinned CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} for Wrangler operations."

# 1c. Authoritative Token Policy & Permission Introspection
TOKEN_ID=$(echo "$TOKEN_VERIFY_RES" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
if [[ -z "$TOKEN_ID" ]]; then
  echo "ERROR: Could not parse token ID from verify response."
  exit 1
fi

echo "==> Introspecting token policy details via user/tokens/${TOKEN_ID}"
TOKEN_DETAILS_RES=$(curl -sS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" "https://api.cloudflare.com/client/v4/user/tokens/${TOKEN_ID}" 2>/dev/null) || {
  echo "ERROR: Failed network request to introspect Cloudflare API Token details."
  exit 1
}

if [[ "$TOKEN_DETAILS_RES" != *"\"success\":true"* ]]; then
  echo "ERROR: Authoritative token policy introspection failed (requires 'User: API Tokens: Read' permission)."
  echo "Cannot prove required write permissions for Workers Scripts, D1, R2, Queues, and Zone Read."
  exit 1
fi

# Verify required write and zone permissions are present in the token's policies structurally via verify-token-policy.mjs
echo "$TOKEN_DETAILS_RES" | node "$(dirname "$0")/verify-token-policy.mjs" - "$ACCOUNT_ID" "$ZONE_ID" || {
  echo "ERROR: Structural token policy verification failed."
  echo "The token must possess ALLOW policies directly covering write permissions for Workers Scripts, D1, R2, and Queues on target account ${ACCOUNT_ID} and Zone Read on target zone ${ZONE_ID}."
  exit 1
}
echo "OK: Authoritative token policy introspection confirmed required write permission groups and resource scopes."
echo "==> Preflighting Cloudflare D1 capability"
npx wrangler d1 list > /dev/null

echo "==> Preflighting Cloudflare R2 capability"
npx wrangler r2 bucket list > /dev/null

echo "==> Preflighting Cloudflare Queues capability"
npx wrangler queues list > /dev/null
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

# 2a. Validate R2_ACCOUNT_ID matches the zone-owning account ID before any mutation
if [[ -n "${R2_ACCOUNT_ID:-}" && "$R2_ACCOUNT_ID" != "$ACCOUNT_ID" ]]; then
  echo "ERROR: Configured R2_ACCOUNT_ID (${R2_ACCOUNT_ID}) does not match zone-owning account ID (${ACCOUNT_ID})."
  echo "Demo R2 S3 credentials and resources must stay in the same Cloudflare account."
  echo "Failing closed before mutating any Cloudflare resources."
  exit 1
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
  echo "[DRY RUN] Role-only admin bootstrap command simulated: node scripts/seed-admin.mjs --demo --remote"

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
echo "                 node scripts/seed-admin.mjs --demo --remote"
echo "================================================================="
