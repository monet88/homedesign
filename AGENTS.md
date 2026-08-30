## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for `monet88/homedesign`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Repository navigation and verification

- Default base branch: `main`.
- Unit tests: `src/**/*.test.ts`, `src/**/*.test.tsx`, and `tests/**/*.test.ts`.
- Workers-runtime tests: `src/**/*.wtest.ts` and `tests/**/*.wtest.ts`.
- Playwright E2E tests: `e2e/**/*.spec.ts`.
- For an OpenNext/Cloudflare worker build, use `npm run build:worker` instead of invoking `opennextjs-cloudflare build` directly; the wrapper performs cross-platform `.open-next` cleanup first.
- Run local smoke/free-first gates through `npm run smoke` and `npm run gate:free-first`; the `.sh` files are CI/POSIX wrappers and may resolve to WSL bash on Windows.

### Local UI / Next server

Start, stop, skip-login (`AUTH_BYPASS`), and localhost links: `docs/agents/local-dev.md`. Use that file when the user wants to view or click the running app.

### Domain docs

This is a single-context repo: read the root `CONTEXT.md` and relevant ADRs in `docs/adr/`. See `docs/agents/domain.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
