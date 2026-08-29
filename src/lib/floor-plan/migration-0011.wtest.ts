// Workers-runtime test for migration 0011 upgrade on a database with legacy duplicate processing stage runs.

import { env, applyD1Migrations, type D1Migration } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  assertCreditInvariant,
  ensureFreeCreditGrant,
  getAvailableCredits,
  holdCredits,
  releaseHold,
  settleHold,
} from "@/lib/credits/ledger";
import { createDesign, reconcileTasks } from "@/lib/ai/lifecycle";
import { completeBriefStageRun, confirmRoomBrief } from "@/lib/floor-plan/brief";

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

    const sourceAssetId = "asset-src-1";
    await env.DB.prepare(
      `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id, created_at, updated_at)
       VALUES (?1, 'source.png', 'image/png', 1024, 'ready', 'key-src', ?2, 1000, 1000)`
    ).bind(sourceAssetId, userId).run();

    const projectId = "proj-1";
    await env.DB.prepare(
      `INSERT INTO projects (id, user_id, kind, name, source_asset_id, status, created_at, updated_at)
       VALUES (?1, ?2, 'floor-plan', 'Test Project', ?3, 'draft', 1000, 1000)`
    ).bind(projectId, userId, sourceAssetId).run();

    const roomId = "room-1";
    await env.DB.prepare(
      `INSERT INTO room_designs (id, project_id, user_id, marker_id, marker_x, marker_y, proposal_json, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'marker-1', 20, 40, '{"roomName":"Living Room"}', 1000, 1000)`
    ).bind(roomId, projectId, userId).run();

    const room2Id = "room-2";
    await env.DB.prepare(
      `INSERT INTO room_designs (id, project_id, user_id, marker_id, marker_x, marker_y, proposal_json, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'marker-2', 50, 50, '{"roomName":"Bedroom"}', 1000, 1000)`
    ).bind(room2Id, projectId, userId).run();

    // --- Seed Room 1: Genuine legacy concurrent race (Winner + Loser) ---
    const winnerTaskId = "task-winner";
    const winnerKey = "idem-winner-key";
    const winnerHoldId = await holdCredits(env, userId, 1, "task", winnerTaskId, "brief");
    await env.DB.prepare(
      `INSERT INTO ai_tasks (id, scene, provider, model, prompt, status, user_id, hold_id, cost_credits, created_at, updated_at)
       VALUES (?1, 'floor-plan', 'fake', 'fake-model', 'prompt-winner', 'processing', ?2, ?3, 1, 1000, 1000)`
    ).bind(winnerTaskId, userId, winnerHoldId).run();
    await env.DB.prepare(
      `INSERT INTO designs (id, user_id, project_id, scene, stage, provider, model, provider_scene, prompt, config_json, source_asset_id, cost_credits, idempotency_key, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'floor-plan', 'brief', 'fake', 'fake-model', 'floor-plan', 'prompt-winner', ?4, ?5, 1, ?6, 1000, 1000)`
    ).bind(winnerTaskId, userId, projectId, JSON.stringify({ intent: { roomId, stage: "brief" } }), sourceAssetId, winnerKey).run();
    await env.DB.prepare(
      `INSERT INTO idempotency_keys (id, user_id, operation, idempotency_key, request_fingerprint, result_type, result_id, created_at)
       VALUES ('idem-win-id', ?1, 'task_create', ?2, 'fp-winner', 'task', ?3, 1000)`
    ).bind(userId, winnerKey, winnerTaskId).run();

    const winnerRunId = "run-winner";
    await env.DB.prepare(
      `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, design_id, created_at, updated_at)
       VALUES (?1, ?2, 'brief', 'processing', ?3, 1000, 1000)`
    ).bind(winnerRunId, roomId, winnerTaskId).run();

    // Loser run: task-loser, created at t=1050 (duplicate processing stage run from legacy race)
    const loserTaskId = "task-loser";
    const loserKey = "idem-loser-key";
    const loserHoldId = await holdCredits(env, userId, 1, "task", loserTaskId, "brief");
    await env.DB.prepare(
      `INSERT INTO ai_tasks (id, scene, provider, model, prompt, status, user_id, hold_id, cost_credits, created_at, updated_at)
       VALUES (?1, 'floor-plan', 'fake', 'fake-model', 'prompt-loser', 'processing', ?2, ?3, 1, 1050, 1050)`
    ).bind(loserTaskId, userId, loserHoldId).run();
    await env.DB.prepare(
      `INSERT INTO designs (id, user_id, project_id, scene, stage, provider, model, provider_scene, prompt, config_json, source_asset_id, cost_credits, idempotency_key, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'floor-plan', 'brief', 'fake', 'fake-model', 'floor-plan', 'prompt-loser', ?4, ?5, 1, ?6, 1050, 1050)`
    ).bind(loserTaskId, userId, projectId, JSON.stringify({ intent: { roomId, stage: "brief" } }), sourceAssetId, loserKey).run();
    await env.DB.prepare(
      `INSERT INTO idempotency_keys (id, user_id, operation, idempotency_key, request_fingerprint, result_type, result_id, created_at)
       VALUES ('idem-lose-id', ?1, 'task_create', ?2, 'fp-loser', 'task', ?3, 1050)`
    ).bind(userId, loserKey, loserTaskId).run();

    const loserRunId = "run-loser";
    await env.DB.prepare(
      `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, design_id, created_at, updated_at)
       VALUES (?1, ?2, 'brief', 'processing', ?3, 1050, 1050)`
    ).bind(loserRunId, roomId, loserTaskId).run();

    // --- Seed Room 2: Lifecycle preservation cases (ready, notified, failed, expired) with stage runs in processing ---
    // Case 1: task is ready, hold settled, stage run left in processing (crash window before finalizeReadyTask: completed_at NULL, project draft)
    const projectReadyId = "proj-ready-crash";
    await env.DB.prepare(
      `INSERT INTO projects (id, user_id, kind, name, source_asset_id, status, created_at, updated_at)
       VALUES (?1, ?2, 'floor-plan', 'Ready Crash Project', ?3, 'draft', 900, 900)`
    ).bind(projectReadyId, userId, sourceAssetId).run();
    const roomReadyId = "room-ready-crash";
    await env.DB.prepare(
      `INSERT INTO room_designs (id, project_id, user_id, marker_id, marker_x, marker_y, proposal_json, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'marker-ready', 30, 30, '{"roomName":"Study"}', 900, 900)`
    ).bind(roomReadyId, projectReadyId, userId).run();

    const readyTaskId = "task-ready-old";
    const readyHoldId = await holdCredits(env, userId, 1, "task", readyTaskId, "layout");
    await settleHold(env, readyHoldId);
    await env.DB.prepare(
      `INSERT INTO ai_tasks (id, scene, provider, model, prompt, status, user_id, hold_id, cost_credits, created_at, updated_at)
       VALUES (?1, 'floor-plan', 'fake', 'fake-model', 'prompt-ready', 'ready', ?2, ?3, 1, 900, 900)`
    ).bind(readyTaskId, userId, readyHoldId).run();
    await env.DB.prepare(
      `INSERT INTO designs (id, user_id, project_id, scene, stage, provider, model, provider_scene, prompt, config_json, source_asset_id, cost_credits, idempotency_key, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'floor-plan', 'layout', 'fake', 'fake-model', 'floor-plan', 'prompt-ready', ?4, ?5, 1, 'idem-ready-key', 900, 900)`
    ).bind(readyTaskId, userId, projectReadyId, JSON.stringify({ intent: { roomId: roomReadyId, stage: "layout" } }), sourceAssetId).run();
    const readyRunId = "run-ready-old";
    await env.DB.prepare(
      `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, design_id, created_at, updated_at)
       VALUES (?1, ?2, 'layout', 'processing', ?3, 900, 900)`
    ).bind(readyRunId, roomReadyId, readyTaskId).run();
    // Case 2: task is notified on brief stage (crash window: hold settled, output asset attached + ready, but proposal_json NULL)
    const notifiedTaskId = "task-notified-old";
    const notifiedHoldId = await holdCredits(env, userId, 1, "task", notifiedTaskId, "brief");
    await settleHold(env, notifiedHoldId);
    const notifiedAssetId = "asset-notified-out";
    await env.DB.prepare(
      `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id, created_at, updated_at)
       VALUES (?1, 'output.png', 'image/png', 1024, 'ready', 'key-notified', ?2, 920, 920)`
    ).bind(notifiedAssetId, userId).run();
    await env.DB.prepare(
      `INSERT INTO project_assets (project_id, asset_id, role, created_at)
       VALUES (?1, ?2, 'generated', 920)`
    ).bind(projectId, notifiedAssetId).run();
    await env.DB.prepare(
      `INSERT INTO ai_tasks (id, scene, provider, model, prompt, status, user_id, hold_id, cost_credits, created_at, updated_at)
       VALUES (?1, 'floor-plan', 'fake', 'fake-model', 'prompt-notified', 'notified', ?2, ?3, 1, 920, 920)`
    ).bind(notifiedTaskId, userId, notifiedHoldId).run();
    await env.DB.prepare(
      `INSERT INTO designs (id, user_id, project_id, scene, stage, provider, model, provider_scene, prompt, config_json, source_asset_id, output_asset_id, cost_credits, idempotency_key, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'floor-plan', 'brief', 'fake', 'fake-model', 'floor-plan', 'prompt-notified', ?4, ?5, ?6, 1, 'idem-notified-key', 920, 920)`
    ).bind(notifiedTaskId, userId, projectId, JSON.stringify({ intent: { roomId: room2Id, stage: "brief" } }), sourceAssetId, notifiedAssetId).run();
    const notifiedRunId = "run-notified-old";
    await env.DB.prepare(
      `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, design_id, created_at, updated_at)
       VALUES (?1, ?2, 'brief', 'processing', ?3, 920, 920)`
    ).bind(notifiedRunId, room2Id, notifiedTaskId).run();

    // Clear room2 proposal_json to accurately model crash window before Brief terminalization
    await env.DB.prepare(
      `UPDATE room_designs SET proposal_json = NULL WHERE id = ?1`
    ).bind(room2Id).run();

    // Case 3: task is failed, hold released, stage run in processing
    const failedTaskId = "task-failed-old";
    const failedHoldId = await holdCredits(env, userId, 1, "task", failedTaskId, "render");
    await releaseHold(env, failedHoldId);
    await env.DB.prepare(
      `INSERT INTO ai_tasks (id, scene, provider, model, prompt, status, user_id, hold_id, cost_credits, created_at, updated_at)
       VALUES (?1, 'floor-plan', 'fake', 'fake-model', 'prompt-failed', 'failed', ?2, ?3, 1, 850, 850)`
    ).bind(failedTaskId, userId, failedHoldId).run();
    const failedRunId = "run-failed-old";
    await env.DB.prepare(
      `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, design_id, created_at, updated_at)
       VALUES (?1, ?2, 'render', 'processing', ?3, 850, 850)`
    ).bind(failedRunId, room2Id, failedTaskId).run();

    // Case 4: task is expired, hold released, stage run in processing
    const expiredTaskId = "task-expired-old";
    const expiredHoldId = await holdCredits(env, userId, 1, "task", expiredTaskId, "panorama");
    await releaseHold(env, expiredHoldId);
    await env.DB.prepare(
      `INSERT INTO ai_tasks (id, scene, provider, model, prompt, status, user_id, hold_id, cost_credits, created_at, updated_at)
       VALUES (?1, 'floor-plan', 'fake', 'fake-model', 'prompt-expired', 'expired', ?2, ?3, 1, 800, 800)`
    ).bind(expiredTaskId, userId, expiredHoldId).run();
    const expiredRunId = "run-expired-old";
    await env.DB.prepare(
      `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, design_id, created_at, updated_at)
       VALUES (?1, ?2, 'panorama', 'processing', ?3, 800, 800)`
    ).bind(expiredRunId, room2Id, expiredTaskId).run();

    // Pre-migration state check:
    // 10 initial - 2 settled (ready, notified) - 2 active (winner, loser) = 6 available
    expect(await getAvailableCredits(env, userId)).toBe(6);

    // 2. Apply all migrations including 0011 from disk via applyD1Migrations
    await applyD1Migrations(env.DB, __D1_MIGRATIONS__);

    // Post-migration state check:
    // 1. Failed/expired tasks have their stage runs marked failed
    const failedRun = await env.DB.prepare(
      `SELECT * FROM floor_plan_stage_runs WHERE id = ?1`
    ).bind(failedRunId).first<{ status: string }>();
    expect(failedRun?.status).toBe("failed");

    const expiredRun = await env.DB.prepare(
      `SELECT * FROM floor_plan_stage_runs WHERE id = ?1`
    ).bind(expiredRunId).first<{ status: string }>();
    expect(expiredRun?.status).toBe("failed");

    // 2. App-level reconciliation handles the non-terminal/crash-window rows with full domain contracts
    await reconcileTasks(env, 0);

    const readyRun = await env.DB.prepare(
      `SELECT * FROM floor_plan_stage_runs WHERE id = ?1`
    ).bind(readyRunId).first<{ status: string }>();
    expect(readyRun?.status).toBe("success");

    const readyDesign = await env.DB.prepare(
      `SELECT * FROM designs WHERE id = ?1`
    ).bind(readyTaskId).first<{ completed_at: number | null }>();
    expect(readyDesign?.completed_at).toBeGreaterThan(0);

    const readyProjectRow = await env.DB.prepare(
      `SELECT * FROM projects WHERE id = ?1`
    ).bind(projectReadyId).first<{ status: string }>();
    expect(readyProjectRow?.status).toBe("ready");

    const notifiedRun = await env.DB.prepare(
      `SELECT * FROM floor_plan_stage_runs WHERE id = ?1`
    ).bind(notifiedRunId).first<{ status: string }>();
    expect(notifiedRun?.status).toBe("success");

    const notifiedTask = await env.DB.prepare(
      `SELECT * FROM ai_tasks WHERE id = ?1`
    ).bind(notifiedTaskId).first<{ status: string }>();
    expect(notifiedTask?.status).toBe("ready");

    const notifiedDesign = await env.DB.prepare(
      `SELECT * FROM designs WHERE id = ?1`
    ).bind(notifiedTaskId).first<{ completed_at: number | null }>();
    expect(notifiedDesign?.completed_at).toBeGreaterThan(0);

    const projectRow = await env.DB.prepare(
      `SELECT * FROM projects WHERE id = ?1`
    ).bind(projectId).first<{ status: string }>();
    expect(projectRow?.status).toBe("ready");

    const room2Row = await env.DB.prepare(
      `SELECT * FROM room_designs WHERE id = ?1`
    ).bind(room2Id).first<{ proposal_json: string | null; recognition_json: string | null }>();
    expect(room2Row?.proposal_json).toBeTruthy();
    expect(room2Row?.recognition_json).toBeTruthy();

    // Confirm Room Brief succeeds without 409 BRIEF_NOT_READY
    const confirmedBrief = await confirmRoomBrief(env, userId, room2Id);
    expect(confirmedBrief.markerLocked).toBe(true);
    expect(confirmedBrief.briefConfirmedAt).toBeTruthy();
    // 2. Winner on room 1 remains processing with active hold and retained idempotency key
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

    const winnerKeyRow = await env.DB.prepare(
      `SELECT * FROM idempotency_keys WHERE user_id = ?1 AND idempotency_key = ?2`
    ).bind(userId, winnerKey).first();
    expect(winnerKeyRow).toBeTruthy();

    // 3. Loser on room 1 transitioned to failed, hold released, idempotency key deleted
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

    // Idempotency key for loser task is DELETED so retry is not poisoned
    const loserKeyRow = await env.DB.prepare(
      `SELECT * FROM idempotency_keys WHERE user_id = ?1 AND idempotency_key = ?2`
    ).bind(userId, loserKey).first();
    expect(loserKeyRow).toBeNull();

    // 4. Credit ledger release entry recorded and credit invariant holds
    const releaseLedger = await env.DB.prepare(
      `SELECT * FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'release' AND ref_id = ?2`
    ).bind(userId, loserTaskId).first<{ amount: number; reason: string }>();
    expect(releaseLedger).toBeTruthy();
    expect(releaseLedger?.amount).toBe(1);

    // Available credits: 10 - 2 (settled) - 1 (winner active) = 7
    expect(await getAvailableCredits(env, userId)).toBe(7);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);

    // 5. Index idx_fp_stage_runs_processing exists and rejects new duplicate processing run
    await expect(
      env.DB.prepare(
        `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, created_at, updated_at)
         VALUES ('run-dup', ?1, 'brief', 'processing', 2000, 2000)`
      ).bind(roomId).run()
    ).rejects.toThrow();

    // 6. Winner terminalizes -> complete brief stage run
    await completeBriefStageRun(env, winnerTaskId);
    const completedWinnerRun = await env.DB.prepare(
      `SELECT * FROM floor_plan_stage_runs WHERE id = ?1`
    ).bind(winnerRunId).first<{ status: string }>();
    expect(completedWinnerRun?.status).toBe("success");

    // 7. Retrying with the same loser idempotency key + same payload now creates a new task cleanly!
    const retryResult = await createDesign(env, userId, {
      sourceAssetId,
      scene: "floor-plan",
      intent: { stage: "brief", marker: { x: 20, y: 40 }, roomId },
      idempotencyKey: loserKey,
    });
    expect(retryResult.id).not.toBe(loserTaskId);
    expect(retryResult.cached).toBe(false);
    expect(retryResult.status).toBe("accepted");

    // 8. Rerun-safety: applying migrations again is a no-op / success
    await expect(applyD1Migrations(env.DB, __D1_MIGRATIONS__)).resolves.toBeUndefined();
  });

  it("preserves duplicate ready tasks with settled holds as successful history during migration 0011", async () => {
    await env.DB.prepare(`DROP INDEX IF EXISTS idx_fp_stage_runs_processing`).run();
    await env.DB.prepare(`DELETE FROM d1_migrations WHERE name LIKE '%0011%'`).run();
    const pre0011Migrations = __D1_MIGRATIONS__.filter((m) => !m.name.startsWith("0011"));
    await applyD1Migrations(env.DB, pre0011Migrations);
    const userId = "user-dup-ready";
    await env.DB.prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?1, 'Dup Ready User', 'dup@example.com', 1, 1000, 1000)`
    ).bind(userId).run();
    await ensureFreeCreditGrant(env, userId);

    const sourceAssetId = "asset-src-dup";
    await env.DB.prepare(
      `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id, created_at, updated_at)
       VALUES (?1, 'source.png', 'image/png', 1024, 'ready', 'key-src-dup', ?2, 1000, 1000)`
    ).bind(sourceAssetId, userId).run();

    const projectId = "proj-dup";
    await env.DB.prepare(
      `INSERT INTO projects (id, user_id, kind, name, source_asset_id, status, created_at, updated_at)
       VALUES (?1, ?2, 'floor-plan', 'Dup Project', ?3, 'draft', 1000, 1000)`
    ).bind(projectId, userId, sourceAssetId).run();

    const roomId = "room-dup";
    await env.DB.prepare(
      `INSERT INTO room_designs (id, project_id, user_id, marker_id, marker_x, marker_y, proposal_json, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'marker-dup', 20, 40, '{"roomName":"Living Room"}', 1000, 1000)`
    ).bind(roomId, projectId, userId).run();

    // 2 duplicate completed layout tasks from legacy race:
    // Both reached ready, both holds settled, but stage runs left in processing
    const taskAId = "task-dup-ready-a";
    const keyA = "idem-dup-key-a";
    const holdAId = await holdCredits(env, userId, 1, "task", taskAId, "layout");
    await settleHold(env, holdAId);
    await env.DB.prepare(
      `INSERT INTO ai_tasks (id, scene, provider, model, prompt, status, user_id, hold_id, cost_credits, created_at, updated_at)
       VALUES (?1, 'floor-plan', 'fake', 'fake-model', 'prompt-a', 'ready', ?2, ?3, 1, 1000, 1000)`
    ).bind(taskAId, userId, holdAId).run();
    await env.DB.prepare(
      `INSERT INTO designs (id, user_id, project_id, scene, stage, provider, model, provider_scene, prompt, config_json, source_asset_id, cost_credits, idempotency_key, completed_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'floor-plan', 'layout', 'fake', 'fake-model', 'floor-plan', 'prompt-a', ?4, ?5, 1, ?6, 1000, 1000, 1000)`
    ).bind(taskAId, userId, projectId, JSON.stringify({ intent: { roomId, stage: "layout" } }), sourceAssetId, keyA).run();
    await env.DB.prepare(
      `INSERT INTO idempotency_keys (id, user_id, operation, idempotency_key, request_fingerprint, result_type, result_id, created_at)
       VALUES ('idem-dup-a', ?1, 'task_create', ?2, 'fp-dup-a', 'task', ?3, 1000)`
    ).bind(userId, keyA, taskAId).run();
    const runAId = "run-dup-ready-a";
    await env.DB.prepare(
      `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, design_id, created_at, updated_at)
       VALUES (?1, ?2, 'layout', 'processing', ?3, 1000, 1000)`
    ).bind(runAId, roomId, taskAId).run();

    const taskBId = "task-dup-ready-b";
    const keyB = "idem-dup-key-b";
    const holdBId = await holdCredits(env, userId, 1, "task", taskBId, "layout");
    await settleHold(env, holdBId);
    await env.DB.prepare(
      `INSERT INTO ai_tasks (id, scene, provider, model, prompt, status, user_id, hold_id, cost_credits, created_at, updated_at)
       VALUES (?1, 'floor-plan', 'fake', 'fake-model', 'prompt-b', 'ready', ?2, ?3, 1, 1050, 1050)`
    ).bind(taskBId, userId, holdBId).run();
    await env.DB.prepare(
      `INSERT INTO designs (id, user_id, project_id, scene, stage, provider, model, provider_scene, prompt, config_json, source_asset_id, cost_credits, idempotency_key, completed_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'floor-plan', 'layout', 'fake', 'fake-model', 'floor-plan', 'prompt-b', ?4, ?5, 1, ?6, 1050, 1050, 1050)`
    ).bind(taskBId, userId, projectId, JSON.stringify({ intent: { roomId, stage: "layout" } }), sourceAssetId, keyB).run();
    await env.DB.prepare(
      `INSERT INTO idempotency_keys (id, user_id, operation, idempotency_key, request_fingerprint, result_type, result_id, created_at)
       VALUES ('idem-dup-b', ?1, 'task_create', ?2, 'fp-dup-b', 'task', ?3, 1050)`
    ).bind(userId, keyB, taskBId).run();
    const runBId = "run-dup-ready-b";
    await env.DB.prepare(
      `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, design_id, created_at, updated_at)
       VALUES (?1, ?2, 'layout', 'processing', ?3, 1050, 1050)`
    ).bind(runBId, roomId, taskBId).run();

    // 10 initial - 2 settled = 8 available
    expect(await getAvailableCredits(env, userId)).toBe(8);

    // Apply migration 0011
    await applyD1Migrations(env.DB, __D1_MIGRATIONS__);

    // Loser stage run (B) is immediately preserved as success; winner (A) remains processing for reconciler
    const runBRowPre = await env.DB.prepare(`SELECT status FROM floor_plan_stage_runs WHERE id = ?1`).bind(runBId).first<{ status: string }>();
    expect(runBRowPre?.status).toBe("success");

    // App-level reconciler completes the winner stage run
    await reconcileTasks(env, 0);

    // Both duplicate stage runs are now success
    const runARow = await env.DB.prepare(`SELECT status FROM floor_plan_stage_runs WHERE id = ?1`).bind(runAId).first<{ status: string }>();
    expect(runARow?.status).toBe("success");

    const runBRow = await env.DB.prepare(`SELECT status FROM floor_plan_stage_runs WHERE id = ?1`).bind(runBId).first<{ status: string }>();
    expect(runBRow?.status).toBe("success");

    // Both tasks must remain ready
    const taskARow = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = ?1`).bind(taskAId).first<{ status: string }>();
    expect(taskARow?.status).toBe("ready");
    const taskBRow = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = ?1`).bind(taskBId).first<{ status: string }>();
    expect(taskBRow?.status).toBe("ready");

    // Both holds remain settled
    const holdARow = await env.DB.prepare(`SELECT status FROM credit_holds WHERE id = ?1`).bind(holdAId).first<{ status: string }>();
    expect(holdARow?.status).toBe("settled");
    const holdBRow = await env.DB.prepare(`SELECT status FROM credit_holds WHERE id = ?1`).bind(holdBId).first<{ status: string }>();
    expect(holdBRow?.status).toBe("settled");

    // Both idempotency keys remain intact
    const keyARow = await env.DB.prepare(`SELECT * FROM idempotency_keys WHERE idempotency_key = ?1`).bind(keyA).first();
    expect(keyARow).toBeTruthy();
    const keyBRow = await env.DB.prepare(`SELECT * FROM idempotency_keys WHERE idempotency_key = ?1`).bind(keyB).first();
    expect(keyBRow).toBeTruthy();

    // Invariant preserved
    expect(await getAvailableCredits(env, userId)).toBe(8);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("preserves app-level crash recovery signal when ready task had completed_at set but proposal_json was NULL before migration", async () => {
    await env.DB.prepare(`DROP INDEX IF EXISTS idx_fp_stage_runs_processing`).run();
    await env.DB.prepare(`DELETE FROM d1_migrations WHERE name LIKE '%0011%'`).run();
    const pre0011Migrations = __D1_MIGRATIONS__.filter((m) => !m.name.startsWith("0011"));
    await applyD1Migrations(env.DB, pre0011Migrations);

    const userId = "user-brief-crash";
    await env.DB.prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?1, 'Brief Crash User', 'briefcrash@example.com', 1, 1000, 1000)`
    ).bind(userId).run();
    await ensureFreeCreditGrant(env, userId);

    const sourceAssetId = "asset-src-brief";
    await env.DB.prepare(
      `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id, created_at, updated_at)
       VALUES (?1, 'source.png', 'image/png', 1024, 'ready', 'key-src-brief', ?2, 1000, 1000)`
    ).bind(sourceAssetId, userId).run();

    const projectId = "proj-brief-crash";
    await env.DB.prepare(
      `INSERT INTO projects (id, user_id, kind, name, source_asset_id, status, created_at, updated_at)
       VALUES (?1, ?2, 'floor-plan', 'Brief Crash Project', ?3, 'ready', 1000, 1000)`
    ).bind(projectId, userId, sourceAssetId).run();

    const roomId = "room-brief-crash";
    await env.DB.prepare(
      `INSERT INTO room_designs (id, project_id, user_id, marker_id, marker_x, marker_y, proposal_json, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'marker-brief-crash', 25, 45, NULL, 1000, 1000)`
    ).bind(roomId, projectId, userId).run();

    const taskId = "task-brief-crash";
    const holdId = await holdCredits(env, userId, 1, "task", taskId, "brief");
    await settleHold(env, holdId);

    const outputAssetId = "asset-out-brief";
    await env.DB.prepare(
      `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id, created_at, updated_at)
       VALUES (?1, 'out.png', 'image/png', 1024, 'ready', 'key-out-brief', ?2, 1000, 1000)`
    ).bind(outputAssetId, userId).run();
    await env.DB.prepare(
      `INSERT INTO project_assets (project_id, asset_id, role, created_at)
       VALUES (?1, ?2, 'generated', 1000)`
    ).bind(projectId, outputAssetId).run();

    await env.DB.prepare(
      `INSERT INTO ai_tasks (id, scene, provider, model, prompt, status, user_id, hold_id, cost_credits, created_at, updated_at)
       VALUES (?1, 'floor-plan', 'fake', 'fake-model', 'prompt-brief', 'ready', ?2, ?3, 1, 1000, 1000)`
    ).bind(taskId, userId, holdId).run();

    await env.DB.prepare(
      `INSERT INTO designs (id, user_id, project_id, scene, stage, provider, model, provider_scene, prompt, config_json, source_asset_id, output_asset_id, cost_credits, idempotency_key, completed_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'floor-plan', 'brief', 'fake', 'fake-model', 'floor-plan', 'prompt-brief', ?4, ?5, ?6, 1, 'idem-brief-key', 1000, 1000, 1000)`
    ).bind(taskId, userId, projectId, JSON.stringify({ intent: { roomId, stage: "brief", marker: { x: 25, y: 45 } } }), sourceAssetId, outputAssetId).run();

    const runId = "run-brief-crash";
    await env.DB.prepare(
      `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, design_id, created_at, updated_at)
       VALUES (?1, ?2, 'brief', 'processing', ?3, 1000, 1000)`
    ).bind(runId, roomId, taskId).run();

    // Pre-migration: proposal_json is NULL, stage run is processing
    const preRoom = await env.DB.prepare(`SELECT proposal_json FROM room_designs WHERE id = ?1`).bind(roomId).first<{ proposal_json: string | null }>();
    expect(preRoom?.proposal_json).toBeNull();

    // Apply migration 0011
    await applyD1Migrations(env.DB, __D1_MIGRATIONS__);

    // Migration 0011 does NOT prematurely promote this stage run to success; it stays processing for app recovery
    const postMigRun = await env.DB.prepare(`SELECT status FROM floor_plan_stage_runs WHERE id = ?1`).bind(runId).first<{ status: string }>();
    expect(postMigRun?.status).toBe("processing");

    // Reconciler runs and restores the domain proposal_json + stage run success
    await reconcileTasks(env, 0);

    const postReconcileRun = await env.DB.prepare(`SELECT status FROM floor_plan_stage_runs WHERE id = ?1`).bind(runId).first<{ status: string }>();
    expect(postReconcileRun?.status).toBe("success");
    const postReconcileRoom = await env.DB.prepare(`SELECT proposal_json FROM room_designs WHERE id = ?1`).bind(roomId).first<{ proposal_json: string | null }>();
    expect(postReconcileRoom?.proposal_json).toBeTruthy();

    // confirmRoomBrief succeeds cleanly without BRIEF_NOT_READY / 409
    const confirmed = await confirmRoomBrief(env, userId, roomId);
    expect(confirmed.markerLocked).toBe(true);
    expect(confirmed.briefConfirmedAt).toBeTruthy();
  });
});
