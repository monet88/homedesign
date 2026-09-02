import { spawnSync } from "node:child_process";
import process from "node:process";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("orchestration guidance schema source diagnostics", () => {
  it("labels an invalid ORCA_SPAWN_AGENT_SCHEMA_JSON override with its selected variable", () => {
    const result = spawnSync(process.execPath, ["scripts/verify-orchestration-guidance.mjs"], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        SPAWN_AGENT_SCHEMA_JSON: "",
        ORCA_SPAWN_AGENT_SCHEMA_JSON: "{",
        ORCA_CLI_COMMAND: process.execPath,
      },
    });

    expect(result.stderr).toContain("could not parse ORCA_SPAWN_AGENT_SCHEMA_JSON:");
    expect(result.stderr).not.toContain("could not parse SPAWN_AGENT_SCHEMA_JSON:");
  });
});
