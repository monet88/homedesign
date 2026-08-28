#!/usr/bin/env node
/** Cross-platform smoke suite: migrations -> seed -> workers-runtime tests. */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCommand } from "./lib/run-command.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

console.log("==> Applying D1 migrations (local)");
runCommand("npx", ["wrangler", "d1", "migrations", "apply", "homedesign", "--local"], {
  cwd: root,
});

console.log("==> Seeding smoke fixtures");
runCommand("node", ["scripts/seed-smoke.mjs"], { cwd: root });

console.log("==> Running workers-runtime integration suite");
if (process.env.SMOKE_SKIP_WRANGLER_TEST !== "1") {
  runCommand("npm", ["run", "wrangler:test"], { cwd: root });
} else {
  console.log("SKIP wrangler:test (already ran in CI)");
}

console.log("OK: smoke suite passed");
