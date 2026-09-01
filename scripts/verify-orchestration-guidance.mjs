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
const allowedFields = new Set(["task_name", "message", "fork_turns", "model", "reasoning_effort"]);
for (const [index, payload] of payloads.entries()) {
  for (const key of Object.keys(payload)) check(allowedFields.has(key), `payload ${index + 1} uses unsupported field: ${key}`);
  check(typeof payload.task_name === "string" && payload.task_name.length > 0, `payload ${index + 1} needs task_name`);
  check(typeof payload.message === "string" && payload.message.length > 0, `payload ${index + 1} needs message`);
  check(payload.fork_turns === "none" || payload.fork_turns === "all" || (typeof payload.fork_turns === "string" && /^[1-9]\d*$/.test(payload.fork_turns)), `payload ${index + 1} has invalid fork_turns`);
  if ("reasoning_effort" in payload) check("model" in payload, `payload ${index + 1} cannot set reasoning_effort without model`);
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
    for (const field of ["task", "worktree", "agent", "terminal", "model", "effort"]) check(workerStart.flags.includes(field), `worker-start schema is missing --${field}`);
    check(workerStart.notes.some((note) => /--effort requires --model/i.test(note)), "worker-start schema must state model/effort coupling");
    check(workerStart.notes.some((note) => /(?:cannot|can't|neither).*combine with --terminal/i.test(note)), "worker-start schema must state terminal/model exclusivity");
  }
  if (checkCommand) {
    for (const field of ["wait", "timeout-ms", "types"]) check(checkCommand.flags.includes(field), `orchestration check schema is missing --${field}`);
  }
  if (send) {
    for (const field of ["task-id", "dispatch-id", "outcome"]) check(send.flags.includes(field), `orchestration send schema is missing --${field}`);
  }
}

if (failures.length > 0) {
  console.error("orchestration guidance verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`orchestration guidance verified against ${executable} agent-context schema (${payloads.length} spawn fixtures)`);
}
