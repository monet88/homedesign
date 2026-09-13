---
title: "Phase 2: Public-domain remediation"
status: pending
---

# Phase 2: Public-domain remediation

## Outcome

Make `design.7app.online` the sole public application origin everywhere that is current/operational, while preserving `cliproxy.monet.uno` as the AI provider endpoint.

## File inventory

| Area | Files | Action | Test impact |
| --- | --- | --- | --- |
| Runtime | `wrangler.jsonc` | Verify only unless drift is found | deploy-policy worker tests |
| OAuth live smoke | `e2e/demo-auth-smoke.spec.ts` | Derive callback from configured base URL | Playwright, separately gated |
| Provisioning | `scripts/demo-provision.sh`, `scripts/setup-cloudflare-envs.sh`, `scripts/seed-admin.mjs` | Replace retired public-origin and zone assumptions after account preflight | shell dry-run/static checks |
| Current docs | `README.md`, `CONTEXT.md`, ADR 0006/0008 | Correct active statements; preserve dated history | docs search |
| Secret hygiene | `.gitignore`, `.env.example` | Add portable ignore and name-only template | Git ignore + secret scan |

## Implementation steps

1. Inspect the exact Cloudflare zone and target account with read-only APIs using the scoped project credential; do not assume a legacy zone/account applies.
2. Update current operational documents and scripts to `design.7app.online`; historical reports retain their original event history but link to the superseding configuration.
3. Make the E2E callback derive from Playwright `baseURL` and add an assertion on the outgoing initiation target without completing OAuth.
4. Isolate absent-secret fixtures from `.env.local`, then repair the daily-cap failure only after reproducing its exact worker-test cause.
5. Add repository-local dotenv ignore rules and an `.env.example` containing names only. Scan staged diff before commit.

## Acceptance and rollback

- `rg` finds no retired public origin in active runtime, E2E, provisioning, README, CONTEXT or current ADRs; provider host remains intact.
- `npm.cmd run typecheck`, focused unit/worker tests and `git diff --check` pass.
- No Cloudflare/GitHub/Vercel write occurs in this phase unless separately approved.
- Roll back a published commit with `git revert`; no reset of user work.

## Security

- Never print dotenv values or build URLs by concatenating credentials.
- Zone preflight must require exact `design.7app.online` authority and least-privilege token scope.
- Do not run the existing live E2E suite until its callback and target are corrected.
