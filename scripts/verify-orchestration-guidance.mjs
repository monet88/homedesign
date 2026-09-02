import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = new URL("..", import.meta.url);
const agents = readFileSync(new URL("AGENTS.md", root), "utf8");
const guide = readFileSync(new URL("docs/agents/orchestration.md", root), "utf8");

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

// `spawn_agent` is a separate capability from Orca's worker-start command.
// Keep its stable payload contract explicit and validate fixtures against this
// input before inspecting the volatile worker-start registry below.
const spawnCapabilitySchema = {
  fields: new Set(["task_name", "message", "fork_turns", "model", "reasoning_effort"]),
  forkTurns: (value) => value === "none" || value === "all" || (typeof value === "string" && /^[1-9]\d*$/.test(value)),
};

function validateSpawnPayload(payload, schema = spawnCapabilitySchema) {
  const errors = [];
  for (const key of Object.keys(payload)) if (!schema.fields.has(key)) errors.push(`unsupported field: ${key}`);
  if (typeof payload.task_name !== "string" || payload.task_name.length === 0) errors.push("task_name is required");
  if (typeof payload.message !== "string" || payload.message.length === 0) errors.push("message is required");
  if (!schema.forkTurns(payload.fork_turns)) errors.push("fork_turns must be none, all, or a positive integer string");
  if ("reasoning_effort" in payload && !("model" in payload)) errors.push("reasoning_effort requires model");
  return errors;
}

function flagsFromUsage(command) {
  return new Set([...String(command?.usage ?? "").matchAll(/--([a-z][a-z0-9-]*)/gi)].map((match) => match[1]));
}

function hasFlag(command, name) {
  if (!Array.isArray(command?.flags)) return flagsFromUsage(command).has(name);
  return command.flags.some((flag) => typeof flag === "string" ? flag === name : flag?.name === name || flag?.long === `--${name}`);
}

function valueSpecFromUsage(command, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(command?.usage ?? "").match(new RegExp(`--${escaped}(?:\\s+<([^>]+)>|\\s+\\[([^\\]]+)\\])?`));
  return match?.[1] ?? match?.[2] ?? null;
}

function validateRepresentativeValues(command, candidate) {
  const errors = [];
  for (const [name, value] of Object.entries(candidate)) {
    if (!hasFlag(command, name)) {
      errors.push(`unsupported --${name}`);
      continue;
    }
    const valueSpec = valueSpecFromUsage(command, name);
    if (!valueSpec) {
      errors.push(`live schema does not describe a value for --${name}`);
      continue;
    }
    const choices = valueSpec.split("|").map((choice) => choice.trim()).filter(Boolean);
    if (choices.length > 1 && !choices.includes(String(value))) {
      errors.push(`--${name} value ${JSON.stringify(value)} is outside live choices ${choices.join("|")}`);
    }
    if (choices.length <= 1 && (typeof value !== "string" || value.length === 0)) {
      errors.push(`--${name} requires a non-empty value`);
    }
  }
  return errors;
}

check(agents.includes("docs/agents/orchestration.md"), "AGENTS.md must point to orchestration guidance");
check(guide.includes("orca agent-context --json"), "guidance must name the live schema discovery command");
check(guide.includes("--wait") && guide.includes("--timeout-ms"), "guidance must preserve bounded event-driven waits");
check(!/coordinator-start\s+to start|coordinator-stop\s+to stop/i.test(guide), "guidance must not recommend retired coordinator operations");

const payloads = [...guide.matchAll(/<!-- schema-check: spawn-payload -->\s*```json\s*([\s\S]*?)\s*```/g)].map((match) => {
  try {
    return JSON.parse(match[1]);
  } catch {
    failures.push("every schema-check spawn payload must be valid JSON");
    return null;
  }
}).filter(Boolean);

check(payloads.length >= 2, "guidance must include isolated and full-history payload fixtures");
for (const [index, payload] of payloads.entries()) {
  for (const error of validateSpawnPayload(payload)) check(false, `payload ${index + 1} ${error}`);
}
check(payloads.some((payload) => payload.fork_turns === "none"), "missing isolated-context fixture");
check(payloads.some((payload) => payload.fork_turns === "all"), "missing full-history fixture");

const executable = process.env.ORCA_CLI_COMMAND?.trim() || "orca";
const [executableName, ...executableArgs] = executable.split(/\s+/);
const runtime = spawnSync(executableName, [...executableArgs, "agent-context", "--json"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
  windowsHide: true,
});

if (runtime.error || runtime.status !== 0) {
  failures.push(`could not read live Orca schema with ${executable} agent-context --json`);
} else {
  let schema;
  try {
    schema = JSON.parse(runtime.stdout);
  } catch {
    failures.push("orca agent-context returned non-JSON output");
  }
  const commands = new Map((schema?.commands ?? []).map((command) => [command.command, command]));
  const workerStart = commands.get("orchestration worker-start");
  const checkCommand = commands.get("orchestration check");
  const send = commands.get("orchestration send");
  check(workerStart, "live schema is missing orchestration worker-start");
  check(checkCommand, "live schema is missing orchestration check");
  check(send, "live schema is missing orchestration send");
  if (workerStart) {
    check(workerStart.argumentMode === "parsed", "worker-start schema must expose parsed argument mode");
    for (const field of ["task", "worktree", "agent", "terminal", "model", "effort"]) check(hasFlag(workerStart, field), `worker-start schema is missing --${field}`);
    const notes = Array.isArray(workerStart.notes) ? workerStart.notes : [];
    const noteText = notes.map((note) => typeof note === "string" ? note : note?.text ?? note?.message ?? "");
    check(noteText.some((note) => /--effort requires --model/i.test(note)), "worker-start schema must state model/effort coupling");
    check(noteText.some((note) => /(?:cannot|can't|neither).*combine with --terminal/i.test(note)), "worker-start schema must state terminal/model exclusivity");

    // Exercise both representative payload shapes against the live command
    // contract.  We validate the option combinations without starting a worker.
    // Worker-start fixtures intentionally do not consume spawn payloads: the
    // two command schemas evolve independently and are validated separately.
    const representatives = [
      { task: "fixture-task", worktree: "current", agent: "codex" },
      { task: "fixture-task", worktree: "current", terminal: "fixture-terminal" },
    ];
    if (hasFlag(workerStart, "model") && hasFlag(workerStart, "effort")) {
      representatives.push({ task: "fixture-task", worktree: "current", agent: "codex", model: "fixture-model", effort: "medium" });
    }
    for (const [index, candidate] of representatives.entries()) {
      for (const error of validateRepresentativeValues(workerStart, candidate)) check(false, `representative payload ${index + 1} ${error}`);
      check(typeof candidate.task === "string" && candidate.task.length > 0, `representative payload ${index + 1} needs task`);
      check(Boolean(candidate.agent) !== Boolean(candidate.terminal), `representative payload ${index + 1} must choose exactly one of agent or terminal`);
      check(!(candidate.model && candidate.terminal), `representative payload ${index + 1} cannot combine model with terminal`);
      if (candidate.effort) check(Boolean(candidate.model), `representative payload ${index + 1} cannot set effort without model`);
    }
    check(representatives.some((candidate) => candidate.agent), "missing agent representative payload");
    check(representatives.some((candidate) => candidate.terminal), "missing terminal representative payload");
  }
  if (checkCommand) {
    for (const field of ["wait", "timeout-ms", "types"]) check(hasFlag(checkCommand, field), `orchestration check schema is missing --${field}`);
  }
  if (send) {
    for (const field of ["task-id", "dispatch-id", "outcome"]) check(hasFlag(send, field), `orchestration send schema is missing --${field}`);
  }
}

if (failures.length > 0) {
  console.error("orchestration guidance verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`orchestration guidance verified against ${executable} agent-context schema (${payloads.length} spawn fixtures)`);
}
