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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **homedesign** (3904 symbols, 7045 relationships, 120 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/homedesign/context` | Codebase overview, check index freshness |
| `gitnexus://repo/homedesign/clusters` | All functional areas |
| `gitnexus://repo/homedesign/processes` | All execution flows |
| `gitnexus://repo/homedesign/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
