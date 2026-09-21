// Batch AI Rendering Queue Service (Sprint 9 - Ticket 9.2)

import type { Env } from "@/lib/bindings";
import {
  type BatchRenderJob,
  type CreateBatchRenderParams,
  type BatchItemProgress,
} from "./types";
import { createTaskWithHold } from "@/lib/ai/task-lifecycle";
import { getAvailableCredits, getWorkspaceAvailableCredits } from "@/lib/credits/ledger";
import { recordWorkspaceAuditLog } from "@/lib/audit/audit-logger";

export const MAX_BATCH_ITEMS = 8;

export async function createBatchRenderJob(
  env: Env,
  params: CreateBatchRenderParams
): Promise<BatchRenderJob> {
  const items = params.items;
  if (!items || items.length === 0) {
    throw new Error("BATCH_EMPTY_ITEMS");
  }
  if (items.length > MAX_BATCH_ITEMS) {
    throw new Error(`BATCH_MAX_ITEMS_EXCEEDED: Tối đa ${MAX_BATCH_ITEMS} ảnh/phòng cho một lượt render hàng loạt`);
  }

  const totalCredits = items.length;
  const wsId = params.workspaceId ?? null;

  // Check workspace membership and credit balance preflight
  if (wsId) {
    const member = await env.DB.prepare(
      `SELECT role FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2`
    )
      .bind(wsId, params.userId)
      .first<{ role: string }>();
    if (!member) {
      throw new Error("FORBIDDEN: Not a member of this workspace");
    }
    if (member.role === "viewer") {
      throw new Error("ROLE_CANNOT_GENERATE: Viewers cannot create batch render jobs");
    }
    const wsCredits = await getWorkspaceAvailableCredits(env, wsId);
    if (wsCredits < totalCredits) {
      throw new Error("INSUFFICIENT_CREDITS");
    }
  } else {
    const userCredits = await getAvailableCredits(env, params.userId);
    if (userCredits < totalCredits) {
      throw new Error("INSUFFICIENT_CREDITS");
    }
  }

  const batchId = crypto.randomUUID();
  const now = Date.now();
  const provider = params.provider ?? "fal"; // Default to fal.ai Flux for fast & cheap batch rendering
  const model = provider === "fal" ? "fal-ai/flux/schnell" : "gemini-2.5-flash-image";

  // 1. Insert Batch Job row
  await env.DB.prepare(
    `INSERT INTO batch_render_jobs (
      id, workspace_id, user_id, name, status, total_items, completed_items, failed_items, total_credits_cost, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, 'pending', ?5, 0, 0, ?6, ?7, ?7)`
  )
    .bind(
      batchId,
      wsId,
      params.userId,
      params.name || `Batch Căn Hộ (${items.length} phòng)`,
      items.length,
      totalCredits,
      now
    )
    .run();

  const taskProgressList: BatchItemProgress[] = [];

  // 2. Create sub-tasks atomically with independent holds
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const idempotencyKey = `batch-${batchId}-item-${i}-${now}`;

    let resolvedSourceKey: string | null = null;
    if (item.sourceAssetId) {
      const assetRow = await env.DB.prepare(
        `SELECT storage_key FROM assets WHERE id = ?1 AND user_id = ?2 AND lifecycle = 'ready'`
      )
        .bind(item.sourceAssetId, params.userId)
        .first<{ storage_key: string }>();
      resolvedSourceKey = assetRow?.storage_key ?? null;
    }

    const taskDef = {
      scene: item.scene || "interior",
      provider,
      model,
      prompt: item.prompt,
      sourceKey: resolvedSourceKey,
      options: {
        roomType: item.roomType,
        presetId: item.presetId,
        batchId,
        batchIndex: i,
        ...item.options,
      },
    };

    const { taskId } = await createTaskWithHold(
      env,
      params.userId,
      taskDef,
      1, // 1 credit per room
      idempotencyKey,
      wsId
    );

    // Link sub-task to the batch
    await env.DB.prepare(
      `UPDATE ai_tasks SET batch_id = ?1 WHERE id = ?2`
    )
      .bind(batchId, taskId)
      .run();

    taskProgressList.push({
      taskId,
      roomType: item.roomType,
      status: "accepted",
      scene: item.scene,
      prompt: item.prompt,
      costCredits: 1,
    });
  }

  // Update batch status to processing
  await env.DB.prepare(
    `UPDATE batch_render_jobs SET status = 'processing', updated_at = ?1 WHERE id = ?2`
  )
    .bind(Date.now(), batchId)
    .run();

  if (wsId) {
    await recordWorkspaceAuditLog(env, {
      workspaceId: wsId,
      actorId: params.userId,
      action: "RENDER_TRIGGERED",
      targetType: "task",
      targetId: batchId,
      details: {
        batchName: params.name,
        totalRooms: items.length,
        totalCredits,
        provider,
      },
    });
  }

  return {
    id: batchId,
    workspaceId: wsId,
    userId: params.userId,
    name: params.name || `Batch Căn Hộ (${items.length} phòng)`,
    status: "processing",
    totalItems: items.length,
    completedItems: 0,
    failedItems: 0,
    totalCreditsCost: totalCredits,
    createdAt: now,
    updatedAt: now,
    items: taskProgressList,
  };
}

export async function getBatchRenderJob(
  env: Env,
  batchId: string,
  userId: string
): Promise<BatchRenderJob | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM batch_render_jobs WHERE id = ?1`
  )
    .bind(batchId)
    .first<{
      id: string;
      workspace_id: string | null;
      user_id: string;
      name: string;
      status: string;
      total_items: number;
      completed_items: number;
      failed_items: number;
      total_credits_cost: number;
      created_at: number;
      updated_at: number;
    }>();

  if (!row) return null;
  // Multi-tenant authorization: caller must be creator or member of the workspace
  if (row.user_id !== userId) {
    if (!row.workspace_id) return null;
    const member = await env.DB.prepare(
      `SELECT role FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2`
    )
      .bind(row.workspace_id, userId)
      .first<{ role: string }>();
    if (!member) return null;
  }

  // Query all linked tasks
  const tasksResult = await env.DB.prepare(
    `SELECT id, status, scene, prompt, options, cost_credits, updated_at
     FROM ai_tasks WHERE batch_id = ?1 ORDER BY created_at ASC`
  )
    .bind(batchId)
    .all<{
      id: string;
      status: string;
      scene: string;
      prompt: string;
      options: string | null;
      cost_credits: number;
      updated_at: number;
    }>();

  const tasks = tasksResult.results ?? [];
  let completed = 0;
  let failed = 0;

  const items: BatchItemProgress[] = tasks.map((t) => {
    let roomType = "Phòng";
    if (t.options) {
      try {
        const parsed = JSON.parse(t.options);
        if (parsed.roomType) roomType = parsed.roomType;
      } catch {
        // ignore
      }
    }

    const isDone = t.status === "ready" || t.status === "notified";
    const isErr = t.status === "failed" || t.status === "expired";

    if (isDone) completed++;
    if (isErr) failed++;

    return {
      taskId: t.id,
      roomType,
      status: t.status,
      scene: t.scene,
      prompt: t.prompt,
      costCredits: t.cost_credits,
      resultKey: isDone ? `ready/${t.id}.png` : null,
    };
  });

  // Calculate overall batch status
  let overallStatus: BatchRenderJob["status"] = "processing";
  if (completed + failed >= row.total_items) {
    if (completed === row.total_items) {
      overallStatus = "completed";
    } else if (failed === row.total_items) {
      overallStatus = "failed";
    } else {
      overallStatus = "partial";
    }
  }

  // Sync back to database if progress changed
  if (
    overallStatus !== row.status ||
    completed !== row.completed_items ||
    failed !== row.failed_items
  ) {
    await env.DB.prepare(
      `UPDATE batch_render_jobs 
       SET status = ?1, completed_items = ?2, failed_items = ?3, updated_at = ?4
       WHERE id = ?5`
    )
      .bind(overallStatus, completed, failed, Date.now(), batchId)
      .run();
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    name: row.name,
    status: overallStatus,
    totalItems: row.total_items,
    completedItems: completed,
    failedItems: failed,
    totalCreditsCost: row.total_credits_cost,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  };
}

export async function listBatchRenderJobs(
  env: Env,
  userId: string,
  workspaceId?: string | null
): Promise<BatchRenderJob[]> {
  let query = `SELECT * FROM batch_render_jobs WHERE user_id = ?1`;
  const bindings: unknown[] = [userId];

  if (workspaceId) {
    const member = await env.DB.prepare(
      `SELECT role FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2`
    )
      .bind(workspaceId, userId)
      .first<{ role: string }>();
    if (!member) {
      return [];
    }
    query = `SELECT * FROM batch_render_jobs WHERE workspace_id = ?1`;
    bindings[0] = workspaceId;
  }

  query += ` ORDER BY created_at DESC LIMIT 20`;

  const result = await env.DB.prepare(query).bind(...bindings).all<{
    id: string;
    workspace_id: string | null;
    user_id: string;
    name: string;
    status: string;
    total_items: number;
    completed_items: number;
    failed_items: number;
    total_credits_cost: number;
    created_at: number;
    updated_at: number;
  }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    name: row.name,
    status: row.status as BatchRenderJob["status"],
    totalItems: row.total_items,
    completedItems: row.completed_items,
    failedItems: row.failed_items,
    totalCreditsCost: row.total_credits_cost,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
