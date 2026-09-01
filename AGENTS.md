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

### Multi-agent orchestration

When a task explicitly calls for multiple agents, supervised dispatch, worker lifecycle, a decision gate, or coordinator ask/reply, read [`docs/agents/orchestration.md`](docs/agents/orchestration.md) before creating or coordinating a worker. The guidance is runtime-derived and includes the authorization boundary; do not treat ordinary implementation requests as permission to create agents or external worktree/process state.

### Local UI / Next server

Start, stop, skip-login (`AUTH_BYPASS`), and localhost links: `docs/agents/local-dev.md`. Use that file when the user wants to view or click the running app.

### Domain docs

This is a single-context repo: read the root `CONTEXT.md` and relevant ADRs in `docs/adr/`. See `docs/agents/domain.md`.

### Capability-aware bootstrap

Before asking a question, exploring files, or using a tool, follow the short bootstrap in [`docs/agents/bootstrap.md`](docs/agents/bootstrap.md): select every applicable skill, then read each selected skill in full through a local-file reader exposed by the current runtime. Process skills run before domain or implementation skills; direct user instructions define scope and take precedence over defaults, while the pre-action skill gate remains checkable. Prefer FastCtx when its reader is exposed and choose an available fallback otherwise—never call a reader the runtime did not expose.

### Browser and research capabilities

When a task needs browser automation, library documentation, URL reading, web search, or deeper research, use the capability-conditional routing in [`docs/agents/browser-research.md`](docs/agents/browser-research.md). Check the current runtime first, investigate the local repository and project docs before external calls, prefer official primary sources, and keep direct citations for external claims.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
