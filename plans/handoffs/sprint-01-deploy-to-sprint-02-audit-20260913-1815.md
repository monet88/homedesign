# Handoff — Sprint 1 deploy to Sprint 2 audit

## Mission and current status

Sprint 1 deployed HomeDesign demo to `https://design.7app.online`. Worker, D1 binding, Google OAuth credential and public auth configuration have been verified at the levels documented in `docs/2026-09-13-sprint-01-deployment-report.md`. Sprint 2 has not started; its purpose is to audit real user journeys and production-readiness without confusing source evidence with live execution.

## Scope and guardrails

Workspace: `E:\monetwork\hmdesign`. Always address the user as “Đại Ka” in Vietnamese. Never print, commit, or copy `.env.local`, service-account JSON, OAuth secret, Cloudflare token, or personal data into artifacts. Use only the Chrome profile explicitly named by the user. Do not create a real OAuth session, AI task, credit mutation, payment, admin mutation, or external request without specific user confirmation at the action boundary.

## Current state

Base was `bca77181454f97ef094c05b2dda1713b1d2c92eb`. Delivery branch is `chore/sprint-01-cloudflare-oauth-deploy` and contains one local commit, `chore(deploy): configure demo Cloudflare domain`; a successor must run `git rev-parse HEAD` before acting because this handoff is part of that commit. Expected changed paths are `wrangler.jsonc`, `tests/deploy.test.ts`, `implementation_notes.html`, `docs/`, `plans/`, and `CONTEXT.md`. `.env.local` is ignored and must remain untracked. Before acting, run `gh pr view --repo monet88/homedesign` to determine the current PR state; this session will attempt to push the finalized branch and open that PR.

## Decisions and rationale

Use a dedicated HomeDesign OAuth client instead of modifying Firebase's auto-created Web client. Use Cloudflare environment `demo`, D1 `homeds`, and custom domain `design.7app.online`. Sprint 1 validates public availability and client-config only; interactive OAuth remains deliberately out of scope. Full behavior work is split into Sprint 2 to avoid introducing fixes during evidence collection.

## Work performed

Skills were imported project-local. D1 migrations were applied. Required auth secrets were placed in local ignored environment configuration and remote Worker Secrets. Worker `homedesign-demo` was deployed successfully. Deployment config tests were aligned with the selected domain and D1. The delivery commit was created locally; pushing and PR creation are the remaining release-record actions. The command history and human-readable result are in the Sprint 1 report; credentials and raw token output are redacted.

## Verification

`npm.cmd test -- tests/deploy.test.ts`: 30 tests passed. `npm.cmd run typecheck`: passed. `git diff --check`: passed. Delivery-file secret scan: passed. Cloudflare deployment exists. Root page and `/api/auth/client-config` both returned HTTP 200; client-config exposed a valid-format Client ID and no secret. Interactive OAuth login, AI generation, credits, library, sharing, floor plan, and admin behavior were not run.

## Open risks and blockers

Google OAuth callback behavior and user session creation remain unverified. OpenNext warns that Windows compatibility is incomplete. A full behavior audit is a multi-journey task and requires explicit confirmation before each mutating real-user action. GitHub CLI's default login did not see the private repo, but the local project GitHub token can access it; do not rely on the default `gh` account.

## Exact next actions

1. **First safe step:** verify the branch, working-tree status, commit ID, and PR state; do not infer either from this handoff.
2. If the delivery branch has not yet been pushed, push it using the local project GitHub token, then create or inspect a PR to `main`.
3. Start Sprint 2 Phase 1 only after the user explicitly authorizes an interactive Google-login smoke in the chosen browser profile.
4. Capture source and live evidence separately, then proceed to generation/credit, library/admin and floor-plan audits per the Sprint 2 plan.

## Source pointers

- `docs/2026-09-13-sprint-01-deployment-report.md`
- `docs/verification-log-2026-09-13-auth-identities.md`
- `implementation_notes.html`
- `plans/260913-0716-project-skills-and-cloudflare-deploy/plan.md`
- `plans/260913-1810-behavioral-audit-and-production-readiness/plan.md`
- `src/lib/auth/server.ts`
- `src/lib/auth/client.ts`
- `src/app/sign-in/page.tsx`
- `src/app/api/auth/client-config/route.ts`
