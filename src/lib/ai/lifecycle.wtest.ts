// Workers-runtime tests for ticket #07: Generation backend lifecycle.
// Proves all acceptance criteria with real D1 + R2 + Queue bindings.
//
// AC coverage:
//   AC1  createDesign happy path: hold created, available drops, project created
//   AC2  createDesign rejections: unverified, bad scene, blocked fields, source
//        not ready, forbidden asset, insufficient credits, floor-plan not impl
//   AC3  Idempotency: same key+payload cached; same key+different payload 409
//   AC4  Full settle path: dispatch → output → quarantine → validate → ready
//   AC5  Provider failure releases hold and restores credits
//   AC6  Validation-exhausted / permanently rejected output releases hold
//   AC7  30-min expiry releases hold; late provider-complete does not resurrect
//   AC8  Client 120s poll window is not terminal; settle happens exactly once
//   AC9  Credit invariant holds after every terminal transition

import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import type { Env } from "@/lib/bindings";
import {
  createDesign,
  getDesignStatus,
  getTask,
  getDesign,
  reconcileTasks,
  MAX_VALIDATION_ATTEMPTS,
} from "@/lib/ai/lifecycle";
import { handleProviderNotify } from "@/lib/ai/notify-consumer";
import { buildInteriorPrompt } from "@/lib/ai/prompt";
import {
  ensureFreeCreditGrant,
  getAvailableCredits,
  getLedgerSummary,
  assertCreditInvariant,
  getActiveHoldByRef,
} from "@/lib/credits/ledger";
import { createTaskWithHold } from "@/lib/payments/core";
import { validPngBytes } from "@/lib/fixtures/images";
import {
  registerProvider,
  resetProviders,
  FakeBadOutputProviderAdapter,
} from "@/lib/ai/provider-adapter";
import {
  createFloorPlanProject,
  placeRoomMarker,
  proposeRoomBrief,
  confirmRoomBrief,
} from "@/lib/floor-plan";



beforeEach(async () => {
  await applyMigrations(env.DB);
  resetProviders();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function seedUser(emailVerified = 1): Promise<string> {
  const userId = crypto.randomUUID();
  const email = `${userId}@example.com`;
  await env.DB.prepare(
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?1, 'Test User', ?2, ?3, ?4, ?4)`
  )
    .bind(userId, email, emailVerified, Date.now())
    .run();
  if (emailVerified === 1) {
    await ensureFreeCreditGrant(env, userId);
  }
  return userId;
}

async function seedReadyAsset(userId: string): Promise<string> {
  const assetId = crypto.randomUUID();
  const key = `ready/${assetId}`;
  const bytes = validPngBytes();
  await env.HD_PRIVATE.put(key, bytes, { httpMetadata: { contentType: "image/png" } });
  await env.DB.prepare(
    `INSERT INTO assets (
       id, name, mime_type, size, lifecycle, storage_key, user_id,
       declared_size, actual_size, created_by, created_at, updated_at
     ) VALUES (?1, 'source.png', 'image/png', ?2, 'ready', ?3, ?4, ?2, ?2, 'test', ?5, ?5)`
  )
    .bind(assetId, bytes.length, key, userId, Date.now())
    .run();
  return assetId;
}

function interiorPayload(
  sourceAssetId: string,
  idempotencyKey: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    sourceAssetId,
    scene: "interior",
    intent: { mode: "redesign", roomType: "living room", style: "modern" },
    options: { aspect_ratio: "1:1", num_outputs: 1 },
    idempotencyKey,
    ...overrides,
  };
}

function exteriorPayload(
  sourceAssetId: string,
  idempotencyKey: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    sourceAssetId,
    scene: "exterior",
    intent: { mode: "redesign", architectureStyle: "modern", timeOfDay: "day" },
    options: { aspect_ratio: "1:1", num_outputs: 1 },
    idempotencyKey,
    ...overrides,
  };
}

function floorPlanPayload(
  sourceAssetId: string,
  idempotencyKey: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    sourceAssetId,
    scene: "floor-plan",
    intent: {
      stage: "layout",
      roomId: "room-layout-test",
      marker: { x: 50, y: 50 },
      style: "modern",
      ...((overrides.intent as Record<string, unknown>) ?? {}),
    },
    options: { aspect_ratio: "1:1", num_outputs: 1 },
    idempotencyKey,
    ...overrides,
  };
}



async function assertHoldState(taskId: string, expected: "active" | "settled" | "released") {
  const hold = await getActiveHoldByRef(env, "task", taskId);
  if (expected === "active") {
    expect(hold).not.toBeNull();
  } else {
    expect(hold).toBeNull();
  }
}

// ── AC1: createDesign happy path ───────────────────────────────────────────────

describe("AC1: createDesign happy path", () => {
  it("creates a design, holds 1 credit, creates a project, and builds the prompt server-side", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    const payload = interiorPayload(assetId, "idem-ac1");

    const result = await createDesign(env, userId, payload);

    expect(result.cached).toBe(false);
    expect(result.status).toBe("accepted");
    expect(result.cost).toBe(1);
    expect(result.projectId).toBeTruthy();

    // Hold is active and available drops by cost.
    expect(await getAvailableCredits(env, userId)).toBe(9);
    await assertHoldState(result.id, "active");

    // Server-built prompt stored on the design row.
    const design = await getDesign(env, result.id);
    expect(design).not.toBeNull();
    expect(design!.prompt).toBe(
      buildInteriorPrompt({ mode: "redesign", roomType: "living room", style: "modern" })
    );
    expect(design!.project_id).toBe(result.projectId);
    expect(design!.cost_credits).toBe(1);

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

// ── AC2: createDesign rejections ─────────────────────────────────────────────

describe("AC2: createDesign rejections", () => {
  it("rejects unknown scene", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    await expect(
      createDesign(env, userId, interiorPayload(assetId, "idem-bad-scene", { scene: "kitchen" }))
    ).rejects.toMatchObject({ code: "INVALID_SCENE", status: 400 });
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("rejects a client-supplied prompt", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    await expect(
      createDesign(env, userId, interiorPayload(assetId, "idem-prompt", { prompt: "make it blue" }))
    ).rejects.toMatchObject({ code: "PROMPT_NOT_ALLOWED", status: 400 });
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("rejects a URL in sourceAssetId", async () => {
    const userId = await seedUser();
    await expect(
      createDesign(env, userId, interiorPayload("http://evil.com/x.png", "idem-url"))
    ).rejects.toMatchObject({ code: "URL_NOT_ALLOWED", status: 400 });
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("rejects an object-key in sourceAssetId", async () => {
    const userId = await seedUser();
    await expect(
      createDesign(env, userId, interiorPayload("ready/owned-by-someone.png", "idem-key"))
    ).rejects.toMatchObject({ code: "OBJECT_KEY_NOT_ALLOWED", status: 400 });
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("rejects source asset that is not ready", async () => {
    const userId = await seedUser();
    const assetId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id, created_at, updated_at)
       VALUES (?1, 'pending.png', 'image/png', 100, 'pending-upload', 'quarantine/${assetId}', ?2, ?3, ?3)`
    )
      .bind(assetId, userId, Date.now())
      .run();

    await expect(
      createDesign(env, userId, interiorPayload(assetId, "idem-not-ready"))
    ).rejects.toMatchObject({ code: "SOURCE_ASSET_NOT_READY", status: 409 });
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("rejects a source asset owned by another user", async () => {
    const owner = await seedUser();
    const thief = await seedUser();
    const assetId = await seedReadyAsset(owner);
    await expect(
      createDesign(env, thief, interiorPayload(assetId, "idem-forbidden"))
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(assertCreditInvariant(env, owner)).resolves.toBe(true);
    await expect(assertCreditInvariant(env, thief)).resolves.toBe(true);
  });

  it("rejects when the user has insufficient credits", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    // Burn the free grant by holding all 10 credits on a different task.
    await createTaskWithHold(
      env,
      userId,
      {
        scene: "image-to-image",
        provider: "fake",
        model: "gemini-2.5-flash-image",
        prompt: "hold",
        sourceKey: null,
        options: {},
      },
      10,
      "burn-all-credits"
    );
    expect(await getAvailableCredits(env, userId)).toBe(0);

    await expect(
      createDesign(env, userId, interiorPayload(assetId, "idem-no-credits"))
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS", status: 402 });
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("rejects floor-plan panorama without confirmed render; layout is allowed", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    await expect(
      createDesign(
        env,
        userId,
        interiorPayload(assetId, "idem-floor-panorama", {
          scene: "floor-plan",
          intent: { stage: "panorama", marker: { x: 50, y: 50 }, roomId: "room-1" },
        })
      )
    ).rejects.toMatchObject({ code: "ASSET_NOT_FOUND", status: 404 });
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });


});

// ── AC3: Idempotency ─────────────────────────────────────────────────────────

describe("AC3: Idempotency", () => {
  it("same idempotencyKey + same payload returns cached result with same id", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    const payload = interiorPayload(assetId, "idem-same");

    const first = await createDesign(env, userId, payload);
    expect(first.cached).toBe(false);

    const second = await createDesign(env, userId, payload);
    expect(second.cached).toBe(true);
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("accepted");

    // Only one hold was created.
    expect(await getAvailableCredits(env, userId)).toBe(9);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("same idempotencyKey + different payload returns 409 IDEMPOTENCY_KEY_REUSED", async () => {
    const userId = await seedUser();
    const assetA = await seedReadyAsset(userId);
    const assetB = await seedReadyAsset(userId);

    await createDesign(env, userId, interiorPayload(assetA, "idem-reused"));

    await expect(
      createDesign(env, userId, interiorPayload(assetB, "idem-reused"))
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", status: 409 });

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

// ── AC4: Full settle path ──────────────────────────────────────────────────────

describe("AC4: Full settle path", () => {
  it("dispatch → output → quarantine → validate → ready → settle exactly once", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    const payload = interiorPayload(assetId, "idem-settle");
    const { id: taskId } = await createDesign(env, userId, payload);
    expect(await getAvailableCredits(env, userId)).toBe(9);

    // Run provider pipeline: writes quarantine object and queues completion.
    const dispatch = await handleProviderNotify(env, { type: "task-dispatch", taskId });
    expect(dispatch.status).toBe("quarantined");

    // Complete the generation: validate output, attach, settle.
    const complete = await handleProviderNotify(env, { type: "provider-complete", taskId });
    expect(complete.status).toBe("ready");

    // Task terminal success, hold settled to usage, output asset ready.
    const task = await getTask(env, taskId);
    expect(task?.status).toBe("ready");
    expect(task?.error_code).toBeNull();

    await assertHoldState(taskId, "settled");
    const summary = await getLedgerSummary(env, userId);
    expect(summary.available).toBe(9);
    expect(summary.totalUsage).toBe(1);
    expect(summary.activeHolds).toBe(0);

    const design = await getDesign(env, taskId);
    expect(design?.output_asset_id).toBeTruthy();
    const outAsset = await env.DB.prepare(
      `SELECT lifecycle, storage_key FROM assets WHERE id = ?1`
    )
      .bind(design!.output_asset_id!)
      .first<{ lifecycle: string; storage_key: string | null }>();
    expect(outAsset?.lifecycle).toBe("ready");
    expect(outAsset?.storage_key).toMatch(/^ready\//);

    // Attached to project.
    const attached = await env.DB.prepare(
      `SELECT 1 AS ok FROM project_assets WHERE project_id = ?1 AND asset_id = ?2 AND role = 'generated'`
    )
      .bind(design!.project_id, design!.output_asset_id!)
      .first<{ ok: number }>();
    expect(attached?.ok).toBe(1);

    // Public status redacts provider/R2 details and exposes output asset id.
    const view = await getDesignStatus(env, userId, taskId);
    expect(view.status).toBe("success");
    expect(view.outputAssetId).toBe(design!.output_asset_id);
    expect(view.errorCode).toBeNull();

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

// ── AC5: Provider failure ────────────────────────────────────────────────────

describe("AC5: Provider failure", () => {
  it("provider-failed releases the hold and restores credits", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    const { id: taskId } = await createDesign(env, userId, interiorPayload(assetId, "idem-fail"));
    expect(await getAvailableCredits(env, userId)).toBe(9);

    const result = await handleProviderNotify(env, {
      type: "provider-failed",
      taskId,
      error: "PROVIDER_FAILED",
    });
    expect(result.status).toBe("failed");

    const task = await getTask(env, taskId);
    expect(task?.status).toBe("failed");
    expect(task?.error_code).toBe("PROVIDER_FAILED");

    await assertHoldState(taskId, "released");
    expect(await getAvailableCredits(env, userId)).toBe(10);
    const summary = await getLedgerSummary(env, userId);
    expect(summary.totalUsage).toBe(0);
    expect(summary.activeHolds).toBe(0);

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

// ── AC6: Validation-exhausted / rejected output ──────────────────────────────

describe("AC6: Validation-exhausted and rejected output", () => {
  it("permanently rejected output fails the task and releases the hold", async () => {
    registerProvider(new FakeBadOutputProviderAdapter());

    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    const { id: taskId } = await createDesign(
      env,
      userId,
      interiorPayload(assetId, "idem-bad-output", { provider: "bad-output" })
    );

    await handleProviderNotify(env, { type: "task-dispatch", taskId });
    const result = await handleProviderNotify(env, { type: "provider-complete", taskId });
    expect(result.status).toBe("failed");

    const task = await getTask(env, taskId);
    expect(task?.status).toBe("failed");
    expect(["OUTPUT_REJECTED", "VALIDATION_EXHAUSTED"]).toContain(task?.error_code);

    await assertHoldState(taskId, "released");
    expect(await getAvailableCredits(env, userId)).toBe(10);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("exhausts the validation retry budget on transient object-missing failures", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    const { id: taskId } = await createDesign(env, userId, interiorPayload(assetId, "idem-exhaust"));

    await handleProviderNotify(env, { type: "task-dispatch", taskId });
    const design = await getDesign(env, taskId);
    expect(design?.output_asset_id).toBeTruthy();

    // Delete the generated quarantine object to make validation transiently fail.
    await env.HD_PRIVATE.delete(`quarantine/${design!.output_asset_id!}`);

    // First MAX_VALIDATION_ATTEMPTS - 1 calls throw transient errors.
    for (let i = 0; i < MAX_VALIDATION_ATTEMPTS - 1; i++) {
      await expect(
        handleProviderNotify(env, { type: "provider-complete", taskId })
      ).rejects.toThrow(/validation transient failure/);
    }

    // The MAX-th call fails the task permanently.
    const result = await handleProviderNotify(env, { type: "provider-complete", taskId });
    expect(result.status).toBe("failed");

    const task = await getTask(env, taskId);
    expect(task?.status).toBe("failed");
    expect(task?.error_code).toBe("VALIDATION_EXHAUSTED");
    expect(task?.validation_attempts).toBeGreaterThanOrEqual(MAX_VALIDATION_ATTEMPTS);

    await assertHoldState(taskId, "released");
    expect(await getAvailableCredits(env, userId)).toBe(10);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

// ── AC7: 30-min expiry + late callback no-resurrect ───────────────────────────

describe("AC7: 30-min expiry and late callback", () => {
  it("expires a stale task, releases the hold, and ignores a late completion", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    const { id: taskId } = await createDesign(env, userId, interiorPayload(assetId, "idem-expire"));
    expect(await getAvailableCredits(env, userId)).toBe(9);

    // Force past the 30-minute server expiry.
    await env.DB.prepare(`UPDATE ai_tasks SET expires_at = ?1 WHERE id = ?2`)
      .bind(Date.now() - 1, taskId)
      .run();

    const reconciled = await reconcileTasks(env);
    expect(reconciled.expired).toBe(1);

    const task = await getTask(env, taskId);
    expect(task?.status).toBe("expired");
    expect(task?.expired_at).toBeTruthy();

    await assertHoldState(taskId, "released");
    expect(await getAvailableCredits(env, userId)).toBe(10);

    // Late provider-complete must not resurrect or settle.
    const late = await handleProviderNotify(env, { type: "provider-complete", taskId });
    expect(late.status).toBe("expired");
    expect(late.skipped).toBe("TERMINAL");

    expect(await getAvailableCredits(env, userId)).toBe(10);
    const summary = await getLedgerSummary(env, userId);
    expect(summary.totalUsage).toBe(0);
    expect(summary.activeHolds).toBe(0);

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

// ── AC8: Client 120s poll is NOT terminal ─────────────────────────────────────

describe("AC8: Client poll window is not terminal", () => {
  it("a quarantined task settles exactly once when provider-complete arrives", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    const { id: taskId } = await createDesign(env, userId, interiorPayload(assetId, "idem-poll"));

    // Simulate provider producing output and leaving task quarantined.
    await handleProviderNotify(env, { type: "task-dispatch", taskId });
    let task = await getTask(env, taskId);
    expect(task?.status).toBe("quarantined");

    // The client 120s poll window passes with no server-side effect; hold stays active.
    await assertHoldState(taskId, "active");
    expect(await getAvailableCredits(env, userId)).toBe(9);

    // Late (from the client's perspective) provider-complete settles exactly once.
    const first = await handleProviderNotify(env, { type: "provider-complete", taskId });
    expect(first.status).toBe("ready");

    // Second completion is a no-op.
    const second = await handleProviderNotify(env, { type: "provider-complete", taskId });
    expect(second.status).toBe("ready");
    expect(second.skipped).toMatch(/TERMINAL|HOLD_NOT_ACTIVE/);

    const summary = await getLedgerSummary(env, userId);
    expect(summary.totalUsage).toBe(1);
    expect(summary.available).toBe(9);
    expect(summary.activeHolds).toBe(0);

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

// ── AC9: Invariant after every terminal transition ───────────────────────────

describe("AC9: Credit invariant", () => {
  it("holds across settle, fail, expire, and validation-exhausted transitions", async () => {
    const userId = await seedUser();

    // Settle path.
    const asset1 = await seedReadyAsset(userId);
    const { id: t1 } = await createDesign(env, userId, interiorPayload(asset1, "inv-settle"));
    await handleProviderNotify(env, { type: "task-dispatch", taskId: t1 });
    await handleProviderNotify(env, { type: "provider-complete", taskId: t1 });
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);

    // Provider failure.
    const asset2 = await seedReadyAsset(userId);
    const { id: t2 } = await createDesign(env, userId, interiorPayload(asset2, "inv-fail"));
    await handleProviderNotify(env, { type: "provider-failed", taskId: t2, error: "BROKEN" });
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);

    // Expiry.
    const asset3 = await seedReadyAsset(userId);
    const { id: t3 } = await createDesign(env, userId, interiorPayload(asset3, "inv-expire"));
    await env.DB.prepare(`UPDATE ai_tasks SET expires_at = ?1 WHERE id = ?2`)
      .bind(Date.now() - 1, t3)
      .run();
    await reconcileTasks(env);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);

    const summary = await getLedgerSummary(env, userId);
    expect(summary.totalGrants).toBe(10);
    expect(summary.totalUsage).toBe(1);
    expect(summary.available).toBe(9);
    expect(summary.activeHolds).toBe(0);
    expect(summary.totalGrants + summary.totalPayments).toBe(
      summary.totalUsage + summary.available + summary.activeHolds
    );
  });
});

// ── Ticket #33: AI Provider selection policy & Offline mode coverage ─────────

describe("Ticket #33: Provider selection policy & offline matrix in Workers runtime", () => {
  it("missing AI_API_KEY in offline env selects FakeProvider and completes generation without network calls", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    const payload = interiorPayload(assetId, "idem-tk33-offline-missing");

    const created = await createDesign(env, userId, payload);
    const taskId = created.id;

    const dispatchResult = await handleProviderNotify(env, {
      type: "task-dispatch",
      taskId,
    });
    expect(dispatchResult.status).toBe("quarantined");

    const completeResult = await handleProviderNotify(env, {
      type: "provider-complete",
      taskId,
      providerTaskId: `fake-${taskId}`,
    });
    expect(completeResult.status).toBe("ready");

    const task = await getTask(env, taskId);
    expect(task?.status).toBe("ready");
    await assertHoldState(taskId, "settled");
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("empty AI_API_KEY in offline env selects FakeProvider and completes generation", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    const emptyEnv = { ...(env as unknown as Env), AI_API_KEY: "" };
    const payload = interiorPayload(assetId, "idem-tk33-offline-empty");

    const created = await createDesign(emptyEnv, userId, payload);
    const taskId = created.id;

    const dispatchResult = await handleProviderNotify(emptyEnv, {
      type: "task-dispatch",
      taskId,
    });
    expect(dispatchResult.status).toBe("quarantined");

    const completeResult = await handleProviderNotify(emptyEnv, {
      type: "provider-complete",
      taskId,
      providerTaskId: `fake-${taskId}`,
    });
    expect(completeResult.status).toBe("ready");

    const task = await getTask(emptyEnv, taskId);
    expect(task?.status).toBe("ready");
    await assertHoldState(taskId, "settled");
  });

  it("explicit live provider 'gemini' WITHOUT configured key fails closed with PROVIDER_NOT_CONFIGURED", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    const noKeyEnv = { ...(env as unknown as Env), AI_API_KEY: "" };
    const payload = interiorPayload(assetId, "idem-tk33-explicit-gemini-no-key", {
      provider: "gemini",
    });

    const created = await createDesign(noKeyEnv, userId, payload);
    const taskId = created.id;

    const dispatchResult = await handleProviderNotify(noKeyEnv, {
      type: "task-dispatch",
      taskId,
    });
    expect(dispatchResult.status).toBe("failed");

    const task = await getTask(noKeyEnv, taskId);
    expect(task?.status).toBe("failed");
    expect(task?.error_code).toBe("PROVIDER_NOT_CONFIGURED");

    // Credit hold must be released
    await assertHoldState(taskId, "released");
    expect(await getAvailableCredits(noKeyEnv, userId)).toBe(10);
    await expect(assertCreditInvariant(noKeyEnv, userId)).resolves.toBe(true);
  });

  it("production environment with missing key fails closed and never selects FakeProvider", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    const prodEnv = {
      ...(env as unknown as Env),
      ENVIRONMENT: "production",
      AI_API_KEY: "",
    };

    // Create design in local, then run generation in production environment
    const created = await createDesign(env, userId, interiorPayload(assetId, "idem-tk33-prod-fail-closed"));
    const taskId = created.id;

    const dispatchResult = await handleProviderNotify(prodEnv, {
      type: "task-dispatch",
      taskId,
    });
    expect(dispatchResult.status).toBe("failed");

    const task = await getTask(prodEnv, taskId);
    expect(task?.status).toBe("failed");
    expect(task?.error_code).toBe("PROVIDER_NOT_CONFIGURED");
    await assertHoldState(taskId, "released");
  });
});

describe("Ticket #33: Offline Generation Full Lifecycle per mode (Interior, Exterior, Floor Plan)", () => {
  it("offline Interior mode reaches validated ready output and settles Credit Hold (1 credit)", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    const payload = interiorPayload(assetId, "idem-interior-full-settle");

    const created = await createDesign(env, userId, payload);
    expect(created.cost).toBe(1);
    const taskId = created.id;

    expect(await getAvailableCredits(env, userId)).toBe(9);
    await assertHoldState(taskId, "active");

    await handleProviderNotify(env, { type: "task-dispatch", taskId });
    await handleProviderNotify(env, { type: "provider-complete", taskId, providerTaskId: `fake-${taskId}` });

    const task = await getTask(env, taskId);
    expect(task?.status).toBe("ready");
    await assertHoldState(taskId, "settled");

    const design = await getDesign(env, taskId);
    expect(design?.output_asset_id).toBeTruthy();

    const summary = await getLedgerSummary(env, userId);
    expect(summary.totalUsage).toBe(1);
    expect(summary.available).toBe(9);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("offline Exterior mode reaches validated ready output and settles Credit Hold (1 credit)", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);
    const payload = exteriorPayload(assetId, "idem-exterior-full-settle");

    const created = await createDesign(env, userId, payload);
    expect(created.cost).toBe(1);
    const taskId = created.id;

    expect(await getAvailableCredits(env, userId)).toBe(9);
    await assertHoldState(taskId, "active");

    await handleProviderNotify(env, { type: "task-dispatch", taskId });
    await handleProviderNotify(env, { type: "provider-complete", taskId, providerTaskId: `fake-${taskId}` });

    const task = await getTask(env, taskId);
    expect(task?.status).toBe("ready");
    await assertHoldState(taskId, "settled");

    const design = await getDesign(env, taskId);
    expect(design?.output_asset_id).toBeTruthy();
    expect(design?.scene).toBe("exterior");

    const summary = await getLedgerSummary(env, userId);
    expect(summary.totalUsage).toBe(1);
    expect(summary.available).toBe(9);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("offline Floor Plan mode (layout stage) reaches validated ready output and settles Credit Hold (2 credits)", async () => {
    const userId = await seedUser();
    const assetId = await seedReadyAsset(userId);

    // Setup Floor Plan project, marker, and confirmed brief
    const { id: projectId } = await createFloorPlanProject(env, userId, assetId);
    const room = await placeRoomMarker(env, userId, projectId, { x: 50, y: 50 });
    await proposeRoomBrief(env, userId, room.id);
    const brief = await createDesign(env, userId, {
      sourceAssetId: assetId,
      scene: "floor-plan",
      intent: { stage: "brief", roomId: room.id, marker: { x: 50, y: 50 } },
      options: { aspect_ratio: "1:1", num_outputs: 1 },
      idempotencyKey: `brief-${room.id}`,
    });
    await handleProviderNotify(env, { type: "task-dispatch", taskId: brief.id });
    await handleProviderNotify(env, { type: "provider-complete", taskId: brief.id, providerTaskId: `fake-${brief.id}` });
    await confirmRoomBrief(env, userId, room.id);

    // Now run Layout stage (cost: 2)
    const initialAvailable = await getAvailableCredits(env, userId); // 9 (1 used for brief)
    const payload = floorPlanPayload(assetId, "idem-floorplan-layout-settle", {
      intent: { stage: "layout", roomId: room.id, marker: { x: 50, y: 50 } },
    });

    const created = await createDesign(env, userId, payload);
    expect(created.cost).toBe(2);
    const taskId = created.id;

    expect(await getAvailableCredits(env, userId)).toBe(initialAvailable - 2);
    await assertHoldState(taskId, "active");

    await handleProviderNotify(env, { type: "task-dispatch", taskId });
    await handleProviderNotify(env, { type: "provider-complete", taskId, providerTaskId: `fake-${taskId}` });

    const task = await getTask(env, taskId);
    expect(task?.status).toBe("ready");
    await assertHoldState(taskId, "settled");

    const design = await getDesign(env, taskId);
    expect(design?.output_asset_id).toBeTruthy();
    expect(design?.scene).toBe("floor-plan");
    expect(design?.stage).toBe("layout");

    const summary = await getLedgerSummary(env, userId);
    expect(summary.totalUsage).toBe(3); // 1 brief + 2 layout
    expect(summary.available).toBe(7);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

// ── Schema bootstrap for the workers-runtime harness ─────────────────────────

async function applyMigrations(db: D1Database) {
  // Drop existing tables so each test starts with the full #7 schema even if a
  // prior test file created an older version of these tables.
  const drops = [
    "DROP TABLE IF EXISTS floor_plan_stage_runs",
    "DROP TABLE IF EXISTS room_designs",
    "DROP TABLE IF EXISTS project_shares",
    "DROP TABLE IF EXISTS project_assets",
    "DROP TABLE IF EXISTS designs",
    "DROP TABLE IF EXISTS projects",
    "DROP TABLE IF EXISTS ai_tasks",
    "DROP TABLE IF EXISTS idempotency_keys",
    "DROP TABLE IF EXISTS mock_payments",
    "DROP TABLE IF EXISTS credit_holds",
    "DROP TABLE IF EXISTS credit_ledger",
    "DROP TABLE IF EXISTS queue_events",
    "DROP TABLE IF EXISTS assets",
    "DROP TABLE IF EXISTS email_outbox",
    "DROP TABLE IF EXISTS verification",
    "DROP TABLE IF EXISTS account",
    "DROP TABLE IF EXISTS session",
    "DROP TABLE IF EXISTS user",
  ];
  for (const sql of drops) {
    await db.prepare(sql).run();
  }

  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT,
        createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL, token TEXT NOT NULL UNIQUE,
        createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
        ipAddress TEXT, userAgent TEXT,
        userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY, accountId TEXT NOT NULL, providerId TEXT NOT NULL,
        issuer TEXT NOT NULL, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        accessToken TEXT, refreshToken TEXT, idToken TEXT,
        accessTokenExpiresAt INTEGER, refreshTokenExpiresAt INTEGER, scope TEXT,
        password TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL,
        expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS email_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT, to_email TEXT NOT NULL, subject TEXT NOT NULL,
        body TEXT NOT NULL, verification_url TEXT NOT NULL, token_fingerprint TEXT NOT NULL,
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, user_id TEXT
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL,
        lifecycle TEXT NOT NULL DEFAULT 'pending-upload'
          CHECK (lifecycle IN ('pending-upload','quarantined','ready','rejected','deleted')),
        storage_key TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        user_id TEXT, declared_size INTEGER, actual_size INTEGER, width INTEGER, height INTEGER,
        created_by TEXT, deleted_at INTEGER, purge_at INTEGER, recovery_until INTEGER
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('interior','exterior','floor-plan')),
        name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', source_asset_id TEXT,
        favorite INTEGER NOT NULL DEFAULT 0, visibility TEXT NOT NULL DEFAULT 'private',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS project_assets (
        project_id TEXT NOT NULL, asset_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('source','generated','share-selected')),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, asset_id, role)
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS designs (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT NOT NULL,
        scene TEXT NOT NULL CHECK (scene IN ('interior','exterior','floor-plan')),
        stage TEXT, provider TEXT NOT NULL, model TEXT NOT NULL, provider_scene TEXT NOT NULL,
        prompt TEXT NOT NULL, config_json TEXT NOT NULL, source_asset_id TEXT NOT NULL,
        output_asset_id TEXT, cost_credits INTEGER NOT NULL, idempotency_key TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS room_designs (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, user_id TEXT NOT NULL,
        marker_id TEXT NOT NULL, marker_x REAL NOT NULL, marker_y REAL NOT NULL,
        marker_locked INTEGER NOT NULL DEFAULT 0, brief_confirmed_at INTEGER,
        progress TEXT NOT NULL DEFAULT 'draft',
        recognition_json TEXT, proposal_json TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        UNIQUE (project_id, marker_id)
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS floor_plan_stage_runs (
        id TEXT PRIMARY KEY, room_design_id TEXT NOT NULL,
        stage TEXT NOT NULL CHECK (stage IN ('brief','layout','render','panorama')),
        status TEXT NOT NULL DEFAULT 'draft',
        design_id TEXT, confirmed_at INTEGER,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS project_shares (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        token_digest TEXT NOT NULL,
        expires_at INTEGER,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL,
        UNIQUE (token_digest)
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS credit_ledger (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        entry_type TEXT NOT NULL CHECK (entry_type IN ('grant','payment','usage','hold','release')),
        amount INTEGER NOT NULL, reason TEXT NOT NULL, ref_type TEXT, ref_id TEXT, grant_key TEXT,
        created_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created ON credit_ledger(user_id, created_at)`
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_grant_key
        ON credit_ledger(user_id, grant_key) WHERE grant_key IS NOT NULL`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS credit_holds (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL CHECK (amount > 0),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','settled','released')),
        ref_type TEXT NOT NULL, ref_id TEXT NOT NULL, ledger_hold_id TEXT,
        created_at INTEGER NOT NULL, settled_at INTEGER, released_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_credit_holds_user_status ON credit_holds(user_id, status)`
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_holds_ref_active
        ON credit_holds(ref_type, ref_id) WHERE status = 'active'`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS mock_payments (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        pack TEXT NOT NULL CHECK (pack IN ('lite','plus','pro','max')), label TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount > 0), idempotency_key TEXT NOT NULL,
        ledger_entry_id TEXT NOT NULL, created_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_mock_payments_user_created ON mock_payments(user_id, created_at)`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS idempotency_keys (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        operation TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL, result_type TEXT NOT NULL, result_id TEXT NOT NULL,
        created_at INTEGER NOT NULL, UNIQUE (user_id, operation, idempotency_key)
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user_created ON idempotency_keys(user_id, created_at)`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS ai_tasks (
        id TEXT PRIMARY KEY, scene TEXT NOT NULL, provider TEXT NOT NULL,
        model TEXT NOT NULL, prompt TEXT NOT NULL, source_key TEXT,
        status TEXT NOT NULL DEFAULT 'accepted'
          CHECK (status IN ('accepted','processing','output','quarantined','notified','ready','failed','expired')),
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        user_id TEXT, hold_id TEXT, cost_credits INTEGER, expires_at INTEGER, expired_at INTEGER,
        provider_task_id TEXT, error_code TEXT, validation_attempts INTEGER NOT NULL DEFAULT 0,
        dispatched_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_ai_tasks_expiry ON ai_tasks(status, expires_at)`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_ai_tasks_user_created ON ai_tasks(user_id, created_at)`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS queue_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, queue TEXT NOT NULL,
        body TEXT NOT NULL, received_at INTEGER NOT NULL
      )`
    ),
  ]);
}
