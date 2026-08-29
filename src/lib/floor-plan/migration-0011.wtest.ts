// Workers-runtime test for migration 0011 upgrade on a database with legacy duplicate processing stage runs.

import { env, applyD1Migrations, type D1Migration } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { assertCreditInvariant, ensureFreeCreditGrant, getAvailableCredits, holdCredits } from "@/lib/credits/ledger";

declare const __D1_MIGRATIONS__: D1Migration[];

describe("Migration 0011 upgrade safety", () => {
  it("cleans up legacy duplicate processing stage runs and preserves credit invariant using applyD1Migrations", async () => {
    // 1. Apply pre-0011 migrations (0001 through 0010)
    const pre0011Migrations = __D1_MIGRATIONS__.filter((m) => !m.name.startsWith("0011"));
    expect(pre0011Migrations.length).toBeGreaterThan(0);
    await applyD1Migrations(env.DB, pre0011Migrations);

    const userId = "user-legacy-race";
    await env.DB.prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?1, 'Legacy User', 'legacy@example.com', 1, 1000, 1000)`
    ).bind(userId).run();
    await ensureFreeCreditGrant(env, userId);

    const projectId = "proj-1";
    await env.DB.prepare(
      `INSERT INTO projects (id, user_id, kind, name, status, created_at, updated_at)
       VALUES (?1, ?2, 'floor-plan', 'Test Project', 'draft', 1000, 1000)`
    ).bind(projectId, userId).run();

    const roomId = "room-1";
    await env.DB.prepare(
      `INSERT INTO room_designs (id, project_id, user_id, marker_id, marker_x, marker_y, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'marker-1', 20, 40, 1000, 1000)`
    ).bind(roomId, projectId, userId).run();

    // Winner run: task-winner, created at t=1000
    const winnerTaskId = "task-winner";
    const winnerHoldId = await holdCredits(env, userId, 1, "task", winnerTaskId, "brief");
    await env.DB.prepare(
      `INSERT INTO ai_tasks (id, scene, provider, model, prompt, status, user_id, hold_id, cost_credits, created_at, updated_at)
       VALUES (?1, 'floor-plan', 'fake', 'fake-model', 'prompt-winner', 'processing', ?2, ?3, 1, 1000, 1000)`
    ).bind(winnerTaskId, userId, winnerHoldId).run();

    const winnerRunId = "run-winner";
    await env.DB.prepare(
      `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, design_id, created_at, updated_at)
       VALUES (?1, ?2, 'brief', 'processing', ?3, 1000, 1000)`
    ).bind(winnerRunId, roomId, winnerTaskId).run();

    // Loser run: task-loser, created at t=1050 (duplicate processing stage run from legacy race)
    const loserTaskId = "task-loser";
    const loserHoldId = await holdCredits(env, userId, 1, "task", loserTaskId, "brief");
    await env.DB.prepare(
      `INSERT INTO ai_tasks (id, scene, provider, model, prompt, status, user_id, hold_id, cost_credits, created_at, updated_at)
       VALUES (?1, 'floor-plan', 'fake', 'fake-model', 'prompt-loser', 'processing', ?2, ?3, 1, 1050, 1050)`
    ).bind(loserTaskId, userId, loserHoldId).run();

    const loserRunId = "run-loser";
    await env.DB.prepare(
      `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, design_id, created_at, updated_at)
       VALUES (?1, ?2, 'brief', 'processing', ?3, 1050, 1050)`
    ).bind(loserRunId, roomId, loserTaskId).run();

    // Pre-migration state check: available credits should be 10 - 2 = 8
    expect(await getAvailableCredits(env, userId)).toBe(8);

    // 2. Apply all migrations including 0011 from disk via applyD1Migrations
    await applyD1Migrations(env.DB, __D1_MIGRATIONS__);

    // Post-migration state check:
    // 1. Winner remains processing with active hold
    const winnerRun = await env.DB.prepare(
      `SELECT * FROM floor_plan_stage_runs WHERE id = ?1`
    ).bind(winnerRunId).first<{ status: string }>();
    expect(winnerRun?.status).toBe("processing");

    const winnerTask = await env.DB.prepare(
      `SELECT * FROM ai_tasks WHERE id = ?1`
    ).bind(winnerTaskId).first<{ status: string }>();
    expect(winnerTask?.status).toBe("processing");

    const winnerHold = await env.DB.prepare(
      `SELECT * FROM credit_holds WHERE id = ?1`
    ).bind(winnerHoldId).first<{ status: string }>();
    expect(winnerHold?.status).toBe("active");

    // 2. Loser transitioned to failed, hold released
    const loserRun = await env.DB.prepare(
      `SELECT * FROM floor_plan_stage_runs WHERE id = ?1`
    ).bind(loserRunId).first<{ status: string }>();
    expect(loserRun?.status).toBe("failed");

    const loserTask = await env.DB.prepare(
      `SELECT * FROM ai_tasks WHERE id = ?1`
    ).bind(loserTaskId).first<{ status: string; error_code: string }>();
    expect(loserTask?.status).toBe("failed");
    expect(loserTask?.error_code).toBe("DUPLICATE_STAGE_RUN_CLEANUP");

    const loserHold = await env.DB.prepare(
      `SELECT * FROM credit_holds WHERE id = ?1`
    ).bind(loserHoldId).first<{ status: string; released_at: number }>();
    expect(loserHold?.status).toBe("released");
    expect(loserHold?.released_at).toBeGreaterThan(0);

    // 3. Credit ledger release entry recorded and credit invariant holds
    const releaseLedger = await env.DB.prepare(
      `SELECT * FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'release' AND ref_id = ?2`
    ).bind(userId, loserTaskId).first<{ amount: number; reason: string }>();
    expect(releaseLedger).toBeTruthy();
    expect(releaseLedger?.amount).toBe(1);

    // Available credits restored to 9 (only 1 active hold for winner)
    expect(await getAvailableCredits(env, userId)).toBe(9);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);

    // 4. Index idx_fp_stage_runs_processing exists and rejects new duplicate
    await expect(
      env.DB.prepare(
        `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, created_at, updated_at)
         VALUES ('run-dup', ?1, 'brief', 'processing', 2000, 2000)`
      ).bind(roomId).run()
    ).rejects.toThrow();

    // 5. Rerun-safety: applying migrations again is a no-op / success
    await expect(applyD1Migrations(env.DB, __D1_MIGRATIONS__)).resolves.toBeUndefined();
  });
});
