#!/usr/bin/env bash
# Secret regression gate (Ticket #30 / Spec #20).
# Scans tracked repository files and recent commit messages for exposed credentials.
# Exits non-zero if potential secrets are detected without printing secret values.
set -euo pipefail

VIOLATIONS=0

is_allowlisted_for_rule2() {
  local file="$1"
  case "$file" in
    cloudflare-env.d.ts|worker-configuration.d.ts|wrangler.jsonc)
      return 0
      ;;
    research/stack-api-contract.md|docs/design/DESIGN.md|docs/*)
      return 0
      ;;
    .github/workflows/*|scripts/preview-*.sh|scripts/setup-cloudflare-envs.sh)
      return 0
      ;;
    src/lib/ai/gemini-adapter.test.ts|src/lib/intake/presign.test.ts)
      return 0
      ;;
    src/lib/auth/auth.wtest.ts|src/lib/auth/outbox.wtest.ts|src/lib/env/deploy-policy.wtest.ts|tests/deploy.test.ts)
      return 0
      ;;
    src/lib/panorama/demo-tour.ts|src/lib/panorama/*.test.ts|src/app/api/tours/*.test.ts|src/app/tour/*.test.tsx|src/app/tour/*/*.test.tsx|src/components/panorama/*.test.tsx|src/lib/payments/*.test.ts|src/app/api/payments/**/*.test.ts|src/app/api/workspaces/*.test.ts|src/app/api/ai/batch-panorama/*.test.ts)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

echo "==> Scanning tracked files at HEAD for secret patterns..."

# Rule 1: Provider tokens (sk- prefixed tokens with non-placeholder suffix)
while IFS=: read -r file line content; do
  [[ -z "$file" ]] && continue
  
  # Allowlist exact safe test key fixture in gemini-adapter.test.ts
  if [[ "$file" == "src/lib/ai/gemini-adapter.test.ts" ]] && [[ "$content" =~ "sk-test-key" ]]; then
    continue
  fi
  
  # Ignore obvious doc placeholders
  if [[ "$content" =~ \<|sk-placeholder|sk-example|sk-your- ]]; then
    continue
  fi

  echo "[RULE-01-PROVIDER-TOKEN] ${file}:${line}: potential provider token detected"
  VIOLATIONS=$((VIOLATIONS + 1))
done < <(git grep -I -nE '\bsk-[a-zA-Z0-9_-]{10,}\b' 2>/dev/null || true)

# Rule 2: Hardcoded password and secret assignments
while IFS=: read -r file line content; do
  [[ -z "$file" ]] && continue

  if is_allowlisted_for_rule2 "$file"; then
    continue
  fi

  # Skip placeholder / template / env references
  if [[ "$content" =~ [:=][[:space:]]*[\"\'](\$|\$\{|\<|\{|\/|test-|dev-only-|mock-|example|demo-|demo_|changeme|placeholder|your[_-]|password123|change-me|\[REDACTED\]) ]]; then
    continue
  fi

  # Skip template literal interpolations or variable references in tests/scripts
  if [[ "$content" =~ \$\{hashedPassword\} || "$content" =~ \$\{password\} ]]; then
    continue
  fi

  echo "[RULE-02-HARDCODED-SECRET] ${file}:${line}: potential hardcoded credential assignment detected"
  VIOLATIONS=$((VIOLATIONS + 1))
done < <(git grep -I -n -i -E '(password|secret|token|api_key|apikey)[[:space:]]*[:=][[:space:]]*["'\''][^"'\'']{6,}["'\'']' 2>/dev/null || true)

echo "==> Scanning recent commit messages (last 10 commits)..."

# Rule 3: Commit messages check
COMMIT_LOG=$(git log --format="%h %B" -10)
while IFS= read -r line; do
  [[ -z "$line" ]] && continue

  if [[ "$line" =~ \bsk-[a-zA-Z0-9_-]{10,}\b ]] && ! [[ "$line" =~ sk-placeholder|sk-example|sk-test-key ]]; then
    echo "[RULE-03-COMMIT-MSG-SECRET] commit message: potential provider token detected"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi

  if [[ "$line" =~ (password|secret|token|api_key|apikey)[[:space:]]*[:=][[:space:]]*[\"\'][^\"\']{6,}[\"\'] ]] && \
     ! [[ "$line" =~ [:=][[:space:]]*[\"\'](\$|\$\{|\<|\{|\/|test-|dev-only-|mock-|example|changeme|placeholder|your[_-]|password123|change-me|\[REDACTED\]) ]]; then
    echo "[RULE-03-COMMIT-MSG-SECRET] commit message: potential hardcoded credential detected"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done <<< "$COMMIT_LOG"

if (( VIOLATIONS > 0 )); then
  echo "FAIL: Detected ${VIOLATIONS} secret violation(s) in repository."
  exit 1
fi

echo "PASS: No exposed secrets detected in tracked files or recent commit messages."
exit 0
