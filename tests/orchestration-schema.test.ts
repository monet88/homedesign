import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

type SpawnSchema = {
  dependentRequired?: Record<string, string[]>;
};

function readSpawnSchema(): SpawnSchema {
  return JSON.parse(
    readFileSync(join(ROOT, "scripts/fixtures/spawn-agent-capability-schema.json"), "utf8")
  ) as SpawnSchema;
}

function satisfiesDependentRequired(
  payload: Record<string, unknown>,
  dependentRequired: Record<string, string[]>
): boolean {
  return Object.entries(dependentRequired).every(([trigger, dependencies]) => {
    if (!(trigger in payload)) return true;
    return dependencies.every((dependency) => dependency in payload);
  });
}

describe("spawn_agent capability schema", () => {
  it("requires model whenever reasoning_effort is supplied", () => {
    const schema = readSpawnSchema();
    const dependentRequired = schema.dependentRequired;

    expect(dependentRequired).toEqual({ reasoning_effort: ["model"] });
    expect(
      satisfiesDependentRequired(
        { task_name: "task", message: "message", reasoning_effort: "medium" },
        dependentRequired ?? {}
      )
    ).toBe(false);
    expect(
      satisfiesDependentRequired(
        { task_name: "task", message: "message", model: "codex", reasoning_effort: "medium" },
        dependentRequired ?? {}
      )
    ).toBe(true);
  });
});
