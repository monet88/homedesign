#!/usr/bin/env node
/**
 * Minimal smoke seed for CI/staging (synthetic data only, ADR 0006).
 * Writes a marker row so deploy smoke can confirm migrations + seed ran.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const markerPath = join(root, ".smoke-seed.json");
const now = Date.now();

writeFileSync(
  markerPath,
  JSON.stringify({ seededAt: now, note: "synthetic smoke marker — not user data" }, null, 2)
);

try {
  execSync(
    `npx wrangler d1 execute homedesign --local --command "INSERT OR REPLACE INTO smoke_markers (id, seeded_at) VALUES ('ci-smoke', ${now})"`,
    { cwd: root, stdio: "inherit" }
  );
} catch {
  // Table may not exist until migration 0009; create idempotently for local smoke.
  execSync(
    `npx wrangler d1 execute homedesign --local --command "CREATE TABLE IF NOT EXISTS smoke_markers (id TEXT PRIMARY KEY, seeded_at INTEGER NOT NULL); INSERT OR REPLACE INTO smoke_markers (id, seeded_at) VALUES ('ci-smoke', ${now})"`,
    { cwd: root, stdio: "inherit" }
  );
}

console.log(`Smoke seed marker written (${now})`);
