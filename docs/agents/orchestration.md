# Runtime-compatible orchestration

This guide is a conditional reference for tasks that explicitly require more than one agent, supervised dispatch, worker lifecycle tracking, a decision gate, or coordinator ask/reply. Keep ordinary implementation work in the current agent; the pointer in `AGENTS.md` is the only always-loaded orchestration context.

## Authority boundary

- A direct user instruction has priority. Creating a worker, worktree, terminal, or external message is an explicit coordination action and needs task scope that authorizes it.
- A supervised dispatch has a coordinator that owns the Run and waits for the worker's result. A full handoff transfers ownership and does not create a worker lifecycle obligation; do not send lifecycle messages or monitor it unless supervision was requested.
- Keep issue comments, pushes, PRs, and other external writes within the user's stated scope. A worker completion report does not authorize unrelated coordinator edits.

## Discover the live schema before spawning

The Orca CLI exposes the local, version-matched command registry without requiring a running app:

```text
orca agent-context --json
```

Read the `commands` entry for the operation you intend to use and copy only its current `usage`, `flags`, and `notes`. If `ORCA_CLI_COMMAND` is configured, use that executable instead of assuming the name `orca`. For the orchestration surface, the relevant entries are `orchestration worker-start`, `orchestration dispatch`, `orchestration check`, and `orchestration send`.

Treat model identifiers as opaque values supplied by the current runtime. Do not paste model names or effort levels from an older guide. In the current `worker-start` contract, `--model` is valid only for a fresh known-agent launch, `--effort` requires `--model`, and neither may be combined with an explicit `--terminal`; let the registry decide whether a selected value is supported. When an option is absent from the registry, omit it rather than guessing a replacement.

The checked-in verifier exercises this contract:

```text
npm run verify:orchestration
```

It checks the documented payload fields and then validates the live `agent-context` registry. A missing runtime is an actionable verification failure, not evidence that an obsolete command is safe.

## Spawn payloads

`spawn_agent` payloads have a deliberately small stable core. The examples below are schema fixtures: `fork_turns: "none"` is isolated context and `fork_turns: "all"` is full-history context. They omit volatile model fields; add `model` and `reasoning_effort` only when the active spawn tool advertises both fields and use its exact values.

<!-- schema-check: spawn-payload -->

```json
{
  "task_name": "isolated-contract-check",
  "message": "Verify the requested contract in a clean context and report evidence.",
  "fork_turns": "none"
}
```

<!-- schema-check: spawn-payload -->

```json
{
  "task_name": "context-aware-review",
  "message": "Review this change using the preceding discussion and report only scoped findings.",
  "fork_turns": "all"
}
```

Do not add convenience keys such as `agent_type`, `provider`, or `effort` to these tool payloads unless the live tool signature explicitly contains them. `fork_turns` accepts `none`, `all`, or a positive integer string; choose the smallest context that preserves the worker's contract.

## Supervised lifecycle

Use the current Run/Task/Dispatch primitives in this order:

1. Create or bind one Run, then create each independent Task before dispatching.
2. Start independent workers with the current `worker-start` schema (or use `dispatch --inject` only when the topology requires the low-level path). Record the returned Dispatch id and worker terminal identity.
3. Workers send exactly one `worker_done` with the injected Task and Dispatch ids and an explicit `--outcome succeeded|failed`; include changed files and a concise three-sentence result.
4. A genuinely idle coordinator waits event-first with a bounded window:

   ```text
   orca orchestration check --wait --types worker_done,escalation,question --timeout-ms 900000 --json
   ```

   Process the whole returned delivery before acknowledging it. A timeout is a checkpoint; continue with another bounded wait while the worker is alive. Do not replace event-driven waits with short sleep/poll loops.

5. After an accepted completion, reuse the exact worker for an immediate follow-up or release it with the current `worker-release` operation. Do not stop or release a worker merely because it is idle, waiting for human input, or a wait window timed out.

Use `ask` for a worker question and resume the original message id after a timeout. Use a coordinator decision gate only for a DAG decision, not as a substitute for a worker question. Legacy automatic coordinator operations are retired; re-read the live guide if the registry notes a recovery action.

## Verification bar

Before reporting success, verify that every command and payload in the run is present in the current registry, that model/effort constraints were respected, and that the coordinator observed a real terminal event (`worker_done`, escalation, or question) rather than a synthetic sentinel. Preserve the command output or test result as evidence when the task is high risk.
