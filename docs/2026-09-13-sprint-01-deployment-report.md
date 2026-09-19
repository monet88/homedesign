# Sprint 1 — Cloudflare + Google OAuth deploy report

**Date:** 2026-09-13

**Status:** completed and live-verified
**Scope:** clone/import project-local skills, align demo Cloudflare configuration, bind existing D1, create Google OAuth credential, deploy and perform non-mutating smoke checks.

## Goal

Deploy the HomeDesign demo from `E:\monetwork\hmdesign` at `https://design.7app.online` without creating a nested repository, exposing credentials, or treating unverified local/source evidence as production proof.

## What was done

### Workspace and project setup

- The repository was placed directly at the workspace root, not inside a clone subfolder.
- Five backup skills were copied into project-local `.agents/skills` and hash-compared with their source. This directory is ignored and remains local-only.
- The active demo configuration was changed from the old Monet domain/D1 placeholder to the existing Cloudflare resources for this deployment:
  - custom domain: `design.7app.online`
  - D1 binding: `homeds`
- The deployment configuration test was updated to assert the same demo domain and D1 binding.

### Cloudflare data and Worker

- All existing D1 migrations were applied to `homeds` before public deployment.
- `homedesign-demo` was created as the demo Worker when the first Worker Secret was uploaded.
- Existing demo R2, Queue and D1 bindings were used; no new D1, R2 or Queue resource was provisioned.
- The current Worker deployment receives 100% traffic at the custom domain.

### Google OAuth and auth configuration

- The Firebase service-account JSON was verified by an access-token and IAM-permission check. It originally had read-only project access; after the Owner granted OAuth Config Editor, the required `clientauthconfig` permissions were confirmed.
- A separate Web OAuth client was created for HomeDesign. The Firebase auto-created Web client was deliberately left untouched.
- Configured OAuth values:
  - JavaScript origin: `https://design.7app.online`
  - redirect URI: `https://design.7app.online/api/auth/callback/google`
- `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` are stored only in ignored `.env.local` and Cloudflare Worker Secrets. This report does not contain their values.

## Live verification evidence

| Check | Result | Evidence level |
|---|---|---|
| Worker deployment | `homedesign-demo` deployed to the custom domain | Verified by Cloudflare deployment output |
| Root page | `GET /` returned HTTP 200 with HomeDesign title | Verified by HTTP execution |
| Public auth config | `GET /api/auth/client-config` returned HTTP 200 and a syntactically valid Google Client ID | Verified by HTTP execution |
| Worker secrets | All three required names are present | Verified by Wrangler secret-list output; values not read |
| D1 schema | All migrations applied | Verified by Wrangler migrations output |
| Deployment config tests | 30 deploy tests passed | Verified by execution |
| Type safety | `npm.cmd run typecheck` passed | Verified by execution |
| Diff/secret hygiene | `git diff --check` and delivery-file secret scan passed | Verified by execution |

## Behavioral audit: Sprint 1 boundary

This sprint performed a focused auth/deploy behavior audit, not a full product audit.

| User-visible transition | Source / live evidence | Status |
|---|---|---|
| Anonymous visitor loads app | Root URL returns HomeDesign | Live-verified |
| Browser requests One Tap config | `/api/auth/client-config` returns Client ID only | Live-verified and source-verified |
| User presses Google sign-in | `signInWithGoogle` calls BetterAuth social provider | Source-verified |
| Server accepts demo auth | Demo requires nonblank, distinct Google ID/secret | Source-verified |
| Google callback completes and session is created | Redirect URI is registered, but no interactive login was run | Not verified in production |
| New demo user generates AI output | Public Demo starts with zero Credits; no generation session was created | Not verified in production |

## Decisions and trade-offs

- A dedicated OAuth client avoids coupling HomeDesign callbacks to Firebase's auto-created client.
- Cloudflare is the active target because the repo already uses OpenNext Worker bindings and the selected D1/zone are in the same account.
- No interactive sign-in was performed: it would create external identity/session state. This keeps Sprint 1 smoke checks non-mutating after credential setup.
- The direct `wrangler deploy` path detected OpenNext and delegated to its deploy wrapper. The artifact and deployment completed successfully, but this behavior should be retained in Sprint 2 notes because OpenNext warns that Windows support is not fully compatible.

## Known risks and remaining work

1. Google OAuth interactive redirect/callback/session has not been executed end-to-end.
2. Google settings can take time to propagate; observe a real redirect result before editing credentials again.
3. Public Demo generation remains gated by credits; the generation, credit-hold, asset, share, admin and floor-plan state machines were not exercised.
4. Wrangler warns that top-level vars are not inherited by `env.demo`. The auth values are intentionally Worker Secrets and were verified remotely; investigate the unrelated email/R2 S3 vars only when their feature is in scope.

## Sprint / phase map

- **Sprint 1, Phase 1 — Cloudflare + OAuth deploy:** completed.
- **Sprint 2, Phase 1 — Auth and deployment smoke:** planned; requires a separate explicit confirmation before a real Google login.
- **Sprint 2, Phases 2–4 — Behavioral audit, remediation, release decision:** planned. See `plans/260913-1810-behavioral-audit-and-production-readiness/plan.md`.

## Git delivery plan

The source/config/test/docs changes are intentionally grouped as a deployment configuration change. The safe delivery path is a dedicated branch, one conventional commit, and a pull request to `main`; no secrets are staged. The final branch/commit/PR identifiers are captured in the handoff created with this sprint.
