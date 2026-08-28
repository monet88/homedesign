import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

function resolveInvocation(command, args) {
  if (process.platform !== "win32") return { command, args };
  if (command === "node") return { command: process.execPath, args };

  if (command === "npm" || command === "npx") {
    const npmExecPath = process.env.npm_execpath;
    const cliFromNpm = npmExecPath
      ? command === "npm"
        ? npmExecPath
        : join(dirname(npmExecPath), "npx-cli.js")
      : null;
    const cli =
      cliFromNpm && existsSync(cliFromNpm)
        ? cliFromNpm
        : join(
            dirname(process.execPath),
            "node_modules",
            "npm",
            "bin",
            `${command}-cli.js`
          );
    return { command: process.execPath, args: [cli, ...args] };
  }

  return { command, args };
}

export function runCommand(
  command,
  args,
  { cwd, env = process.env, allowFailure = false, capture = false } = {}
) {
  const invocation = resolveInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    env,
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
  });

  if (capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }

  if (result.error) throw result.error;

  const status = result.status ?? 1;
  if (status !== 0 && !allowFailure) process.exit(status);

  return {
    status,
    stdout: capture ? result.stdout ?? "" : "",
    stderr: capture ? result.stderr ?? "" : "",
  };
}
