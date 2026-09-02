# Browser and research guidance

Use this guide when a task needs browser automation, library documentation, a
known URL, web search, or deeper research. It is reached through the compact
global pointer; do not load it for local-only edits.

## Capability-first routing

Inspect the current runtime tool catalog (or the relevant CLI `--help`) before
choosing a provider. Treat a provider name as available only when that
capability is exposed in the current run.

| Need | Preferred capability when exposed | Fallback |
| --- | --- | --- |
| Local files and repo docs | FastCtx `inspect_local_file`, `grep`, `glob` | The available local file reader, then a shell reader |
| Browser interaction | `agent-browser` | An exposed browser/tab tool; if none is available, use URL fetch/search and state that interaction was not performed |
| Library/API docs | Context7 resolve, then Context7 docs | Search or fetch the library's current official documentation |
| Known URL | Exa fetch or Tavily extract | Browser open/read, then the native web open operation |
| Web search | Exa search, then Tavily search | Native web search; browser search only when a browser capability is exposed |
| Deeper research | Tavily research or Exa summary | Several narrow searches against primary sources, with a short synthesis |

Never call a missing provider to test whether it exists. If a preferred
capability is absent, follow the fallback in the same row and record the
substitution in the handoff.

## Investigation order

1. Search the local repository, its `docs/`, relevant ADRs, package metadata,
   and tests. Local project contracts are authoritative for project behavior.
2. For a library or technical claim, prefer the current official reference,
   migration guide, specification, or source/types for the installed version.
3. Use browser interaction only for actions that require a rendered page,
   login, or a user-visible flow. Keep interactions scoped to the requested
   page and use the runtime's safe/headless defaults.
4. Cite every externally sourced claim with the direct URL. Keep citations near
   the claim and distinguish an inference from what the source states.

## Completion check

The task is complete when the selected capability path is recorded, no
unavailable provider was attempted, local-first investigation is covered, and
all external claims have direct citations. If no suitable capability exists,
return the local findings plus the blocked external step instead of inventing a
result.
