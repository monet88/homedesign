#!/usr/bin/env node

/**
 * Dry-run the capability-aware bootstrap without invoking external tools.
 * The fallback reader is represented by `view_file`; a real runtime must
 * substitute whichever local-file reader it actually exposes.
 */

const selectedSkills = ["diagnosing-bugs", "domain-modeling"];

const readerOrder = ["inspect_local_file", "view_file", "read_file"];

function chooseReader(capabilities) {
  return readerOrder.find((reader) => capabilities.has(reader)) ?? null;
}

function runScenario(name, capabilities) {
  const reader = chooseReader(capabilities);
  if (!reader) {
    throw new Error(`${name}: no local-file reader is exposed`);
  }

  const calls = selectedSkills.map((skill) => ({
    reader,
    path: `skills/${skill}/SKILL.md`,
    read: "full",
  }));
  const unavailableCalls = calls.filter((call) => !capabilities.has(call.reader));

  if (unavailableCalls.length > 0) {
    throw new Error(`${name}: attempted an unavailable reader`);
  }

  return {
    name,
    selectedSkills,
    reader,
    calls,
    unavailableCalls,
    ok: true,
  };
}

const onlyFallback = process.argv.includes("--without-fastctx");
const scenarios = onlyFallback
  ? [
      runScenario("without-fastctx", new Set(["view_file"])),
    ]
  : [
      runScenario("with-fastctx", new Set(["inspect_local_file", "view_file"])),
      runScenario("without-fastctx", new Set(["view_file"])),
    ];

const result = {
  ok: scenarios.every((scenario) => scenario.ok && scenario.unavailableCalls.length === 0),
  scenarios,
};

console.log(JSON.stringify(result, null, 2));
