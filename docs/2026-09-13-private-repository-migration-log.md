# Private repository migration log

**Date:** 2026-09-13
**Requested destination:** `newmylab/hmdesign` (private)

## Credential boundaries

- `GITHUB_GALA` was used only to manage the existing PR in the legacy repository.
- `GITHUB_TOKEN` is reserved for creating and pushing the requested destination repository.
- Neither token value, header, nor credential metadata is recorded here.

## Verified actions

| Action | Result | Evidence level |
| --- | --- | --- |
| Inspect PR #74 with `GITHUB_GALA` | Authorized account could read the PR | Verified by GitHub API execution |
| Close PR #74 | PR state is `CLOSED` | Verified by GitHub API execution |
| Authenticate `GITHUB_TOKEN` for the new account | Failed with HTTP 401 `Bad credentials` | Verified failure by GitHub API execution |

## Current migration state

The destination repository has **not** been created and no source has been pushed to a new account. The local `origin` remains unchanged because `GITHUB_TOKEN` has not authenticated successfully. This prevents an accidental remote/account migration.

## Required next gate

Refresh only `GITHUB_TOKEN` in `.env.local` with a valid token for `newmylab` that can create and write private repositories. Before any write, the migration operator must verify the authenticated login is exactly `newmylab`, verify that `newmylab/hmdesign` is absent or is the intended empty private repository, then create it and push the current verified HEAD as `main`.

## Re-check after local credential update

| Credential | Result | Evidence level |
| --- | --- | --- |
| `GITHUB_TOKEN` | GitHub API still returned HTTP 401 `Bad credentials`; no repository read/write was attempted after the failure | Verified failure by API execution |
| `VERCEL_TOKEN` | No variable with this exact name was found in `.env.local`; no Vercel API call was made | Verified by local configuration-name inspection |

No token values were read into this log.

## Re-check for requested owner `ngohong7710-wq`

`GITHUB_TOKEN` was checked again after the requested account changed. GitHub returned HTTP 401 `Bad credentials`, so the authenticated owner could not be verified as `ngohong7710-wq`; `ngohong7710-wq/hmdesign` was not inspected or created. This was a read-only authentication check.

## Verified destination-owner check: `gosoniccapital-ui`

`GITHUB_TOKEN` authenticated successfully as `gosoniccapital-ui`, matching the requested destination account. A read-only lookup of `gosoniccapital-ui/hmdesign` did not resolve an accessible repository. No create, push, remote rewrite, or deployment was performed in this check.

## Completed private-repository bootstrap

| Check | Result | Evidence level |
| --- | --- | --- |
| Destination repository | `gosoniccapital-ui/hmdesign` created as private, default branch `main` | Verified by GitHub API execution |
| Git history | A new root commit `e5fffa4` with no parent was created from the reviewed working tree | Verified by local Git execution |
| Source transfer | Remote `main` SHA equals local `e5fffa4` | Verified by authenticated `git ls-remote` |
| Local remotes | Only `origin` targeting `gosoniccapital-ui/hmdesign` remains | Verified by Git execution |

The original shallow history was intentionally not transferred. Generated build/runtime artifacts (`.open-next`, `.wrangler`) and project-local agent files were excluded from the new root commit. A portable repository ignore rule now covers `.env`, `.env.local`, and `.env.*.local`.

## Provider base-URL transition

The configured AI provider base URL changed from the legacy host to `https://pro.autommo.online/v1`; the configured model remains `gemini-3.1-flash-image`. Read-only checks received HTTP 401 from `GET /v1/models` and HTTP 404 from `GET /v1`, demonstrating network reachability and an authentication boundary only. They do not prove authenticated model availability or image-generation compatibility.

Focused provider/deploy tests passed (87 tests) and TypeScript typecheck passed. No authenticated provider health check, AI generation, Cloudflare deploy, OAuth flow, credit action, or admin mutation was run.

The provider configuration commit `ab2a996` was pushed to `main`; authenticated remote verification confirmed that `main` resolves to the same SHA. The repository remains private and its only configured local remote is `gosoniccapital-ui/hmdesign`.
