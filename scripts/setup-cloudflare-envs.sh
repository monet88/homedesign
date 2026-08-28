#!/usr/bin/env bash
# Human wizard: four Cloudflare accounts + GitHub secrets for HomeDesign (ADR 0006 / ticket #18).
# Do NOT run end-to-end in CI — operators run this locally once per account.
set -euo pipefail

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""
fi

TOTAL_STAGES=4
_STAGE_INDEX=0
ENV_FILE="${ENV_FILE:-.env.cloudflare-wizard}"
WRITTEN_ENV=(); WRITTEN_SECRET=(); SKIPPED=()

_clear() { [[ -t 1 ]] || return 0; command -v tput >/dev/null 2>&1 && tput clear || printf '\033[2J\033[H'; }
banner() { _clear; printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"; printf '%s  %s stages%s\n\n' "$DIM" "$TOTAL_STAGES" "$RESET"; pause "Ready?"; }
stage() { _clear; _STAGE_INDEX=$((_STAGE_INDEX + 1)); printf '\n%s▸ Stage %s/%s · %s%s\n' "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"; }
say() { printf '  %s\n' "$1"; }
step() { printf '  • %s\n' "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  ⚠ %s\n' "$1"; }
open_url() { local u="$1"; printf '  ↗ %s\n' "$u"; command -v explorer.exe >/dev/null 2>&1 && explorer.exe "$u" >/dev/null 2>&1 || true; }
pause() { printf '  %s ' "${1:-Press Enter}"; read -r _ || true; }
ask() { local k="$1" p="$2"; printf '  %s: ' "$p"; read -r "$k" || true; }
ask_secret() { local k="$1" p="$2"; printf '  %s (hidden): ' "$p"; read -rs "$k" || true; printf '\n'; }
write_env() { touch "$ENV_FILE"; grep -vE "^$1=" "$ENV_FILE" > "${ENV_FILE}.tmp" 2>/dev/null || true; printf '%s=%s\n' "$1" "$2" >> "${ENV_FILE}.tmp"; mv "${ENV_FILE}.tmp" "$ENV_FILE"; WRITTEN_ENV+=("$1"); }
set_secret() {
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    printf '%s' "$2" | gh secret set "$1" && WRITTEN_SECRET+=("$1") && return
  fi
  SKIPPED+=("gh secret set $1")
  warn "Set GitHub secret $1 manually"
}
finish() { _clear; printf '\n✓ Wizard complete\n'; (( ${#SKIPPED[@]} )) && warn "Manual: ${SKIPPED[*]}"; }

banner "HomeDesign — four Cloudflare accounts (dev / preview / staging / production)"

stage "Development account (homedesign-dev)"
say "Create/use the development Cloudflare account. Least-privilege API token for D1/R2/Queues/Workers."
open_url "https://dash.cloudflare.com/profile/api-tokens"
step "Create token: Edit Cloudflare Workers + D1 + R2 + Queues (account scoped)."
ask CLOUDFLARE_DEV_ACCOUNT_ID "Development account ID"
ask_secret CLOUDFLARE_DEV_API_TOKEN "Development API token"
write_env CLOUDFLARE_DEV_ACCOUNT_ID "$CLOUDFLARE_DEV_ACCOUNT_ID"
set_secret CLOUDFLARE_DEV_API_TOKEN "$CLOUDFLARE_DEV_API_TOKEN"
note "Provision hd-dev D1 (apac), hd-dev-* R2 buckets, hd-dev-* queues via wrangler --env development"

stage "Preview account (homedesign-preview)"
open_url "https://dash.cloudflare.com/profile/api-tokens"
ask CLOUDFLARE_PREVIEW_ACCOUNT_ID "Preview account ID"
ask_secret CLOUDFLARE_PREVIEW_API_TOKEN "Preview API token (PR ephemeral resources)"
write_env CLOUDFLARE_PREVIEW_ACCOUNT_ID "$CLOUDFLARE_PREVIEW_ACCOUNT_ID"
set_secret CLOUDFLARE_PREVIEW_API_TOKEN "$CLOUDFLARE_PREVIEW_API_TOKEN"
set_secret CLOUDFLARE_PREVIEW_ACCOUNT_ID "$CLOUDFLARE_PREVIEW_ACCOUNT_ID"

stage "Staging account (homedesign-staging)"
ask CLOUDFLARE_STAGING_ACCOUNT_ID "Staging account ID"
ask_secret CLOUDFLARE_STAGING_API_TOKEN "Staging API token"
write_env CLOUDFLARE_STAGING_ACCOUNT_ID "$CLOUDFLARE_STAGING_ACCOUNT_ID"
set_secret CLOUDFLARE_STAGING_API_TOKEN "$CLOUDFLARE_STAGING_API_TOKEN"
set_secret CLOUDFLARE_STAGING_ACCOUNT_ID "$CLOUDFLARE_STAGING_ACCOUNT_ID"
note "After provisioning, run: bash scripts/smoke.sh against staging via workflow_dispatch"

stage "Production account (homedesign-prod) — approval-gated CI"
warn "Production token ONLY in protected GitHub environment with required reviewers."
ask CLOUDFLARE_PROD_ACCOUNT_ID "Production account ID"
ask_secret CLOUDFLARE_PROD_API_TOKEN "Production API token"
write_env CLOUDFLARE_PROD_ACCOUNT_ID "$CLOUDFLARE_PROD_ACCOUNT_ID"
set_secret CLOUDFLARE_PROD_API_TOKEN "$CLOUDFLARE_PROD_API_TOKEN"
note "Production: Mock Payment / Free Grant / email sign-up / generation OFF until policy accepted."

finish
