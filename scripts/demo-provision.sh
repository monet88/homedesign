#!/usr/bin/env bash
# Provision isolated Public Demo Cloudflare resources (ADR 0008 / Issue #72).
# Target: https://homedesign.monet.uno
# Resources:
#   D1: hd-demo (apac)
#   R2: hd-demo-private, hd-demo-public, hd-demo-next-cache
#   Queues: hd-demo-asset-validate, hd-demo-asset-validate-dlq, hd-demo-provider-notify
#
# Supports dry-run validation mode via --dry-run: validates token preflight and config without creating live resources.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

echo "==> Public Demo Cloudflare Provisioning (ADR 0008 / Issue #72)"

# Preflight check for Wrangler token
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN is not set in environment."
  echo "Wrangler token preflight required. Note: cloudflared credentials are not a substitute."
  exit 1
fi

echo "==> Verifying Wrangler authentication via whoami"
npx wrangler whoami

if [[ "$DRY_RUN" == "true" ]]; then
  echo "==> [DRY RUN] Verified whoami successfully. Skipping live resource provisioning as requested by --dry-run."
  exit 0
fi

echo "==> Provisioning D1 database: hd-demo (location: apac)"
npx wrangler d1 create "hd-demo" --location=apac || true

echo "==> Provisioning R2 buckets: hd-demo-private, hd-demo-public, hd-demo-next-cache"
for suffix in private public next-cache; do
  npx wrangler r2 bucket create "hd-demo-${suffix}" || true
done

echo "==> Provisioning Queues: hd-demo-asset-validate, hd-demo-asset-validate-dlq, hd-demo-provider-notify"
npx wrangler queues create "hd-demo-asset-validate" || true
npx wrangler queues create "hd-demo-asset-validate-dlq" || true
npx wrangler queues create "hd-demo-provider-notify" || true

echo "==> Applying migrations to hd-demo"
npx wrangler d1 migrations apply "hd-demo" --remote

echo "==> Public Demo resources provisioned successfully."
