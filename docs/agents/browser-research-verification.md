# Browser and research routing verification

These scenarios exercise the routing rules with deliberately incomplete
capability sets. Record the exposed capability names and attempted calls while
running each scenario; an unavailable provider call is a failure, not a
fallback.

Run the deterministic dry-run from the repository root:

```text
npm run verify:browser-research
```

The verifier replays both scenarios with the same capability matrix and emits a
JSON attempt log. The replay uses offline native search/open adapters, reads
actual repository files for local evidence, and checks that every citation is a
direct HTTPS URL returned by an opened result. A replay mismatch, unresolved
route, unavailable call, or citation failure is a failed verification rather
than a silently accepted fallback.

## Scenario 1: library documentation without a provider-specific docs tool

**Capabilities exposed:** local file reader, native web search/open. Context7,
Exa, Tavily, and `agent-browser` are absent.

1. Read the relevant package version, local README/types, and nearby tests
   first.
2. Search the package's current official documentation with native web search,
   then open the official result.
3. Use the source to answer one version-sensitive API question and cite its
   direct URL.

**Pass conditions:** local evidence is recorded before the web call; the
answer has a direct official citation; only the local reader and native web
capabilities appear in the attempted-call log; no Context7, Exa, Tavily, or
`agent-browser` call is attempted.

## Scenario 2: general web research without Exa/Tavily/browser

**Capabilities exposed:** local file reader and native web search/open only.
All provider-specific search, fetch, research, and browser capabilities are
absent.

1. Search the repository and project docs for existing facts and constraints.
2. Run two narrow native web searches against primary or official sources, open
   the useful results, and synthesize only claims supported by those sources.
3. Put a direct URL citation next to each externally sourced claim and label
   any inference.

**Pass conditions:** the local-first step is visible; the attempted-call log
contains only the local reader and native web capabilities; no Exa, Tavily,
Context7, or `agent-browser` call is attempted; citations resolve to the pages
that support the claims.

## Verification record

For each run, keep a short record with:

```text
capabilities: <names exposed by this runtime>
local-first evidence: <files or searches>
selected route: <capability and fallback, if any>
attempted calls: <ordered names>
citations: <direct URLs>
result: PASS | FAIL
```

The executable log uses the same fields (`capabilities`, `selectedRoute`,
`attemptedCalls`, `unavailableCalls`, and `result`) so a real run can be audited
without inferring which provider was selected.
