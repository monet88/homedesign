# Sprint 2 / Phase 1 — Auth and deploy smoke audit

**Thời điểm:** 2026-09-13 19:09 ICT
**Phạm vi:** map source flow Google auth và smoke HTTP không tạo session trên Public Demo.
**Không thực hiện:** browser/OAuth login, tạo user/session, cấp hoặc dùng Credits, AI generation, thanh toán, admin mutation, hoặc deploy.

## Baseline đã xác minh trước audit

| Hạng mục | Quan sát | Evidence level |
| --- | --- | --- |
| Branch | `chore/sprint-01-cloudflare-oauth-deploy` | Verified by Git execution |
| HEAD | `908b2b1739719b4b70fbc097dfa33b6cbcdeb153` — `chore(deploy): configure demo Cloudflare domain` | Verified by Git execution |
| Working tree | Sạch (`git status --short` không có output) | Verified by Git execution |
| Worktree | Một worktree tại `E:/monetwork/hmdesign` | Verified by Git execution |
| PR hiện tại | `gh pr view --json ...` trả `Could not resolve to a Repository with the name 'monet88/homedesign'` | Blocked: GitHub CLI identity/repository access; không suy ra không có PR |

## Auth behavioral map

```text
Anonymous visitor
  -> /sign-in button
  -> signInWithGoogle("/")
  -> better-auth client: signIn.social({ provider: "google" })
  -> POST /api/auth/sign-in/social
  -> /api/auth/[...all] catch-all
  -> handleAuthRequest -> createAuth
  -> BetterAuth Google provider / registered callback
  -> session cookie (httpOnly)
  -> GET /api/auth/get-session (token removed from JSON)
```

- `/sign-in` calls `signInWithGoogle("/")`; the client uses the browser origin as `baseURL`.
- `createAuth` configures Google from server-only environment values, uses `BETTER_AUTH_URL` as `baseURL` and sole `trustedOrigins` entry, and rejects a demo configuration with a missing/blank Google client ID or missing/equal secret.
- `/api/auth/[...all]` delegates the callback and social routes to BetterAuth. `/api/auth/get-session` has its own handler and omits `session.token` from its JSON response.
- Google One Tap is best-effort for an anonymous browser and starts from a GET of `/api/auth/client-config`; no browser was opened during this audit, because that can initiate the real identity-provider UX.
- In demo policy, email/password sign-up and sign-in are rejected; `ensureFreeCreditGrant` is a no-op, so a valid future Google session starts at zero Credits unless an Admin Credit Grant exists.

## Non-mutating live smoke — `https://design.7app.online`

The following were direct HTTP **GET** requests only. They did not send an OAuth authorization request, use a browser profile, or retain a session.

| Request | Observation | Evidence level |
| --- | --- | --- |
| `GET /` | HTTP 200; HTML contains `HomeDesign` | Verified by HTTP execution |
| `GET /sign-in` | HTTP 200; HTML contains `HomeDesign` | Verified by HTTP execution |
| `GET /api/auth/client-config` | HTTP 200; only `googleClientId`, non-empty; no `googleClientSecret` field | Verified by HTTP execution |
| `GET /api/auth/get-session` | HTTP 200; `cache-control: no-store`; body `null` | Verified by HTTP execution |

This is not evidence that Google accepts the redirect, callback completes, or a session cookie is created. Those checks remain gated on a separate confirmation immediately before a real login in the browser profile that Đại Ka designates.

## Local verification

| Command | Result | Evidence level |
| --- | --- | --- |
| `npm.cmd test -- src/lib/auth/session.test.ts` | 1 file, 10 tests passed | Verified by execution |
| `npm.cmd run wrangler:test -- src/lib/auth/auth.wtest.ts` | 1 file, 17 tests passed | Verified by execution |
| `npm.cmd run wrangler:test -- src/lib/env/deploy-policy.wtest.ts` | 1 failed, 11 passed | Verified failure by execution |

The worker test harness reports that it loads `.env.local`; no secret values were read or recorded.

## Findings

### F1 — Live auth smoke targets the retired demo hostname

- **Severity / confidence:** P2 / High.
- **Evidence:** `e2e/demo-auth-smoke.spec.ts` describes and hard-codes `https://homedesign.monet.uno`, including its social callback URL. Current demo configuration instead uses `design.7app.online` in `wrangler.jsonc`; the current live HTTP smoke also succeeded on that latter origin.
- **Impact:** Enabling `DEMO_LIVE_GOOGLE_SMOKE=1` with the intended current deployment can validate an obsolete callback/origin rather than the deployed OAuth client. The test is already separately gated, so it was not run here.
- **Recommendation:** In a dedicated remediation ticket, derive the callback URL from Playwright's configured base URL (or update the explicit current deployment URL), then add a non-mutating assertion that the generated social initiation URL uses the configured origin. Recheck all deploy scripts/docs/ADRs that still name the old hostname before claiming a complete domain migration.

### F2 — Demo auth fail-closed worker test is environment-contaminated

- **Severity / confidence:** P2 / High.
- **Evidence:** `npm.cmd run wrangler:test -- src/lib/env/deploy-policy.wtest.ts` fails at the assertion expecting `createAuth(baseDemo)` to throw for missing `GOOGLE_CLIENT_ID`. The test constructs `baseDemo` by spreading `cloudflare:test` `env`, while the harness loads `.env.local`; the local environment contains both Google variable names. Therefore the values are still present rather than missing. `src/lib/auth/server.ts` contains the intended demo fail-closed branch, but this particular test does not isolate its absent-secret fixture.
- **Impact:** The negative configuration invariant is not reliably tested on developer machines with live local OAuth variables. This is a coverage/isolation defect, not evidence that the deployed Worker accepts missing credentials.
- **Recommendation:** In a separate test-only fix, explicitly unset/omit the Google fields after the environment spread (or construct a minimal `AuthEnv` fixture) for each negative case; rerun the worker policy suite with local env variables present.

## Phase decision

Source mapping and safe deployment smoke are complete. Interactive OAuth redirect/callback/session verification is **not started** and requires Đại Ka's separate confirmation at the login action boundary. No evidence was gathered for authenticated zero-credit state, because doing so needs such a session; source/tests support the policy but do not replace a production observation.
