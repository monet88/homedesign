#!/usr/bin/env node
/** Cross-platform Workers Free release gate (ADR 0006 / ticket #18). */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCommand } from "./lib/run-command.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const maxBundleBytes = 3 * 1024 * 1024;
const wranglerEnv = process.env.WRANGLER_ENV || "production";

function parseGzipBytes(output) {
  const clean = output.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
  const match = clean.match(
    /Total Upload:[^\r\n]*?\/\s*gzip:\s*([\d.]+)\s*(B|KiB|MiB)/i
  );
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(value)) return null;
  if (unit === "mib") return Math.ceil(value * 1024 * 1024);
  if (unit === "kib") return Math.ceil(value * 1024);
  return Math.ceil(value);
}

console.log("==> Building Next.js + OpenNext (production worker build)");
runCommand("npm", ["run", "build:worker"], { cwd: root });

console.log(`==> wrangler deploy --dry-run (--env ${wranglerEnv})`);
const dryRun = runCommand(
  "npx",
  ["wrangler", "deploy", "--dry-run", "--env", wranglerEnv],
  { cwd: root, capture: true }
);

const compressedSize = parseGzipBytes(`${dryRun.stdout}\n${dryRun.stderr}`);
if (compressedSize === null) {
  console.error("FAIL: unable to read Wrangler dry-run gzip bundle size");
  process.exit(1);
}

console.log(
  `Compressed worker bundle: ${compressedSize} bytes (Workers Free limit: ${maxBundleBytes})`
);
if (compressedSize > maxBundleBytes) {
  console.error("FAIL: bundle exceeds 3MB Workers Free compressed limit");
  process.exit(1);
}

console.log(`==> CPU gate (documented, not measured in CI)
Workers Free allows 10ms CPU per invocation. Before enabling Workers Paid:
  1. Run staging smoke with real traffic fixtures.
  2. Review Workers Logs CPU duration p95 per route.
  3. Record evidence + budget owner in deploy notes.`);

console.log("OK: free-first bundle gate passed");
