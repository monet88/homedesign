# Capability-aware agent bootstrap

This is the on-demand procedure referenced by `AGENTS.md`. Keep the pointer in
the root guidance short; use this file when a task starts.

## Before action

Complete these steps, in order, before asking a question, exploring the
repository, or calling any other tool:

1. **Select skills.** Identify every skill that applies to the request. Put
   process skills (for example, diagnose, plan, review, or implement) first,
   followed by domain or tool-specific skills.
2. **Read selected skills.** Inspect every selected skill's complete `SKILL.md`
   with a local-file reader that is present in the current runtime. Do not rely
   on a remembered copy or a partial read.
3. **Run the workflows.** Follow the selected skills in their declared order
   and finish each verification gate before moving on.

Direct user instructions take precedence over default agent behavior and set the
task's scope. They do not make an unselected skill applicable, and the ordered
pre-action gate above stays explicit and checkable.

## Choose a reader from capabilities

Discover the tools exposed by the current runtime before choosing a reader.

| Capability exposed now | Reader to use |
| --- | --- |
| FastCtx `inspect_local_file` | Preferred reader; use it for every selected `SKILL.md`. |
| Another local-file reader (for example `view_file`, `read_file`, or an equivalent) | Use the exposed reader and preserve the full-file requirement. |
| No local-file reader | Stop before action, report that the selected skills cannot be read in this runtime, and wait for a reader to become available. |

The names in the second row are examples, not promises about a particular
runtime. A capability check must happen for each run. In particular, a runtime
without FastCtx must take its exposed fallback branch; it must not attempt a
FastCtx call and then recover from an unavailable-tool error.

## Completion check

The bootstrap is complete only when the run can show:

- the complete set of selected skills;
- one successful full-file read for every selected skill; and
- the concrete reader chosen from the runtime's exposed capabilities, with no
  attempted call to an unavailable reader.

The verifier resolves each selected skill to a real, non-empty `SKILL.md` and
records its byte/line count after a full read. Set `BOOTSTRAP_SKILLS` (comma
separated) and `SKILLS_ROOT` when exercising a different skill set; otherwise
the standard agent skill roots are searched.

Use `npm run verify:bootstrap` for the repository dry-run covering both reader
branches, or append `--without-fastctx` to exercise only the fallback branch.
