#!/usr/bin/env bash
# Janitor: delete preview resources older than 72 hours (ADR 0006 / ticket #18).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TTL_SECONDS=$((72 * 60 * 60))
NOW=$(date +%s)

if [[ -z "${CLOUDFLARE_PREVIEW_API_TOKEN:-}" || -z "${CLOUDFLARE_PREVIEW_ACCOUNT_ID:-}" ]]; then
  echo "SKIP: preview janitor no-op (secrets absent)"
  exit 0
fi

export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_PREVIEW_API_TOKEN"
export CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_PREVIEW_ACCOUNT_ID"

STATE_DIR=".preview-state"
if [[ ! -d "$STATE_DIR" ]]; then
  echo "No preview state directory — nothing to janitor"
  exit 0
fi

for file in "$STATE_DIR"/pr-*.json; do
  [[ -f "$file" ]] || continue
  created=$(node -e "const j=require('${file//\\/\\\\}'); process.stdout.write(String(j.created_at||0))")
  age=$((NOW - created))
  if (( age > TTL_SECONDS )); then
    pr=$(node -e "const j=require('${file//\\/\\\\}'); process.stdout.write(String(j.pr))")
    echo "Janitor: PR #${pr} age ${age}s > ${TTL_SECONDS}s — destroying"
    PR_NUMBER="$pr" bash scripts/preview-destroy.sh
  fi
done

echo "OK: preview janitor complete"
