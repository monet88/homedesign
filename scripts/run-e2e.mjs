#!/usr/bin/env node
/**
 * Self-provisioning Deterministic E2E Test Runner (Ticket #37 / Spec #20)
 *
 * 1. Generates image fixtures (scripts/create-e2e-fixtures.mjs).
 * 2. Applies local D1 migrations (wrangler d1 migrations apply homedesign --local).
 * 3. Provisions administrator with dynamic/per-run credentials (scripts/seed-admin.mjs).
 * 4. Executes Playwright test suite against the local development environment with FakeProvider.
 * 5. Isolates mutable admin state with a fresh per-run admin identity by default.
 */

import crypto from "node:crypto";
import { join } from "node:path";
import { runCommand } from "./lib/run-command.mjs";

const root = join(import.meta.dirname, "..");

console.log("==> [e2e-runner] Step 1/4: Ensuring test image fixtures exist");
runCommand("node", ["scripts/create-e2e-fixtures.mjs"], { cwd: root });

console.log("==> [e2e-runner] Step 2/4: Applying local D1 migrations");
runCommand("npx", ["wrangler", "d1", "migrations", "apply", "homedesign", "--local"], {
  cwd: root,
});

console.log("==> [e2e-runner] Step 3/4: Provisioning administrator account");
const adminPassword =
  process.env.ADMIN_PASSWORD ||
  `AdminE2E-${Date.now()}-${crypto.randomBytes(4).toString("hex")}!Aa1`;
const adminEmail = (
  process.env.ADMIN_EMAIL ||
  `e2e-admin-${Date.now()}-${crypto.randomBytes(4).toString("hex")}@example.com`
)
  .trim()
  .toLowerCase();

const seedEnv = {
  ...process.env,
  ADMIN_EMAIL: adminEmail,
  ADMIN_PASSWORD: adminPassword,
  ADMIN_INITIAL_CREDITS: process.env.ADMIN_INITIAL_CREDITS || "99999",
};

runCommand("node", ["scripts/seed-admin.mjs"], { cwd: root, env: seedEnv });

console.log("==> [e2e-runner] Step 4/4: Running Playwright E2E suite");
const playwrightArgs = ["playwright", "test", ...process.argv.slice(2)];

const testEnv = {
  ...process.env,
  ADMIN_EMAIL: adminEmail,
  ADMIN_PASSWORD: adminPassword,
  EMAIL_DELIVERY_MODE: "test-outbox",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "dev-only-insecure-secret-for-local-e2e",
  OUTBOX_ACCESS_SECRET: process.env.OUTBOX_ACCESS_SECRET || "dev-only-insecure-secret-for-local-e2e",
  // Ensure we do not pass live AI API key to enforce FakeProvider offline path
  AI_API_KEY: "",
};

const result = runCommand("npx", playwrightArgs, {
  cwd: root,
  env: testEnv,
  allowFailure: true,
});

if (result.status !== 0) {
  console.error(`==> [e2e-runner] Playwright run failed with exit code ${result.status}`);
  process.exit(result.status);
}

console.log("==> [e2e-runner] Playwright E2E suite completed successfully");
process.exit(0);
