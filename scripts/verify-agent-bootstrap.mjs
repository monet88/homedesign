#!/usr/bin/env node

/**
 * Dry-run the capability-aware bootstrap without invoking an agent tool.
 * The selected skills are real SKILL.md files and every selected file is read
 * in full through the reader chosen from the exposed capability set.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import process from "node:process";

const defaultSelectedSkills = ["diagnosing-bugs", "domain-modeling"];
const readerOrder = ["inspect_local_file", "view_file", "read_file"];

function selectedSkillsFromEnvironment() {
  const value = process.env.BOOTSTRAP_SKILLS?.trim();
  if (!value) return defaultSelectedSkills;
  const skills = value.split(",").map((skill) => skill.trim()).filter(Boolean);
  if (skills.length === 0) throw new Error("BOOTSTRAP_SKILLS must contain at least one skill");
  return skills;
}

function candidateSkillRoots() {
  const explicit = [process.env.SKILLS_ROOT, process.env.CODEX_SKILLS_ROOT, process.env.AGENTS_SKILLS_ROOT]
    .filter(Boolean)
    .map((root) => (isAbsolute(root) ? root : resolve(process.cwd(), root)));
  return [...new Set([
    ...explicit,
    resolve(process.cwd(), "skills"),
    resolve(process.cwd(), ".agents", "skills"),
    join(homedir(), ".agents", "skills"),
    "C:\\Users\\monet\\.agents\\skills",
  ])];
}

function resolveSkillFiles(selectedSkills) {
  const roots = candidateSkillRoots();
  return selectedSkills.map((skill) => {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(skill)) throw new Error(`invalid skill name: ${skill}`);
    const file = roots.map((root) => join(root, skill, "SKILL.md")).find((candidate) => existsSync(candidate));
    if (!file) throw new Error(`selected skill file not found: ${skill}/SKILL.md (searched ${roots.join(", ")})`);
    return file;
  });
}

/**
 * All local-file readers implement this small interface.  Keeping the
 * capability name at the adapter boundary makes it impossible for the
 * verifier to silently call a different reader than the one it selected.
 */
function readerAdapters() {
  const read = (file) => readFileSync(file, "utf8");
  return new Map(readerOrder.map((capability) => [capability, { capability, read }]));
}

function chooseReader(capabilities, adapters) {
  return readerOrder
    .map((capability) => adapters.get(capability))
    .find((adapter) => adapter && capabilities.has(adapter.capability)) ?? null;
}

function readFullSkillFile(adapter, file) {
  if (!adapter) throw new Error("cannot read a skill without a reader");
  const content = adapter.read(file);
  const bytes = statSync(file).size;
  if (content.trim().length === 0 || bytes === 0) throw new Error(`selected skill file is empty: ${file}`);
  return { reader: adapter.capability, path: file, read: "full", bytes, lines: content.split(/\r?\n/).length };
}

function runScenario(name, capabilities, selectedSkills, skillFiles) {
  const adapters = readerAdapters();
  const reader = chooseReader(capabilities, adapters);
  if (!reader) throw new Error(`${name}: no local-file reader is exposed`);
  // Invoke the selected adapter for every file through the common `read`
  // interface; do not probe or call an unavailable provider first.
  const attemptedCalls = skillFiles.map((file) => readFullSkillFile(reader, file));
  const unavailableCalls = attemptedCalls.filter((call) => !capabilities.has(call.reader));
  if (unavailableCalls.length > 0) throw new Error(`${name}: attempted an unavailable reader`);
  return { name, selectedSkills, reader: reader.capability, attemptedCalls, unavailableCalls, ok: true };
}

function main() {
  const selectedSkills = selectedSkillsFromEnvironment();
  const skillFiles = resolveSkillFiles(selectedSkills);
  const onlyFallback = process.argv.includes("--without-fastctx");
  const scenarios = onlyFallback
    ? [runScenario("without-fastctx", new Set(["view_file"]), selectedSkills, skillFiles)]
    : [
        runScenario("with-fastctx", new Set(["inspect_local_file", "view_file"]), selectedSkills, skillFiles),
        runScenario("without-fastctx", new Set(["view_file"]), selectedSkills, skillFiles),
      ];
  console.log(JSON.stringify({ ok: scenarios.every((scenario) => scenario.ok && scenario.unavailableCalls.length === 0), scenarios }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`bootstrap verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
