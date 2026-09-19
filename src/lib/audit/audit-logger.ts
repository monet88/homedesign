import type { Env } from "@/lib/bindings";
import type {
  RecordAuditLogParams,
  WorkspaceAuditLog,
  ListAuditLogsOptions,
} from "./types";

/**
 * Record an audit log for a workspace action.
 * Fail-safe: Returns null on failure without interrupting the main transaction.
 */
export async function recordWorkspaceAuditLog(
  env: Env,
  params: RecordAuditLogParams
): Promise<string | null> {
  try {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const detailsJson = params.details ? JSON.stringify(params.details) : null;

    await env.DB.prepare(
      `INSERT INTO workspace_audit_logs (
        id, workspace_id, actor_id, action, target_type, target_id, details, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    )
      .bind(
        id,
        params.workspaceId,
        params.actorId,
        params.action,
        params.targetType,
        params.targetId ?? null,
        detailsJson,
        createdAt
      )
      .run();

    return id;
  } catch (err) {
    console.warn(
      `[AuditLog] Non-fatal error recording audit log for workspace ${params.workspaceId}:`,
      err
    );
    return null;
  }
}

interface RawAuditLogRow {
  id: string;
  workspace_id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: string | null;
  created_at: number;
  actor_name: string | null;
  actor_email: string | null;
  actor_image: string | null;
}

/**
 * List audit logs for a workspace with pagination and optional filters.
 */
export async function listWorkspaceAuditLogs(
  env: Env,
  workspaceId: string,
  options: ListAuditLogsOptions = {}
): Promise<{ logs: WorkspaceAuditLog[]; nextCursor?: number }> {
  const limit = Math.min(Math.max(1, options.limit ?? 20), 50);
  const conditions: string[] = ["wal.workspace_id = ?1"];
  const bindings: unknown[] = [workspaceId];

  let bindIdx = 2;

  if (options.cursor) {
    conditions.push(`wal.created_at < ?${bindIdx}`);
    bindings.push(options.cursor);
    bindIdx++;
  }

  if (options.action) {
    conditions.push(`wal.action = ?${bindIdx}`);
    bindings.push(options.action);
    bindIdx++;
  }

  if (options.actorId) {
    conditions.push(`wal.actor_id = ?${bindIdx}`);
    bindings.push(options.actorId);
    bindIdx++;
  }

  const query = `
    SELECT 
      wal.id,
      wal.workspace_id,
      wal.actor_id,
      wal.action,
      wal.target_type,
      wal.target_id,
      wal.details,
      wal.created_at,
      u.name AS actor_name,
      u.email AS actor_email,
      u.image AS actor_image
    FROM workspace_audit_logs wal
    LEFT JOIN user u ON wal.actor_id = u.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY wal.created_at DESC
    LIMIT ${limit + 1}
  `;

  let stmt = env.DB.prepare(query);
  if (bindings.length > 0) {
    stmt = stmt.bind(...bindings);
  }

  const result = await stmt.all<RawAuditLogRow>();
  const rows = result.results ?? [];

  const hasNext = rows.length > limit;
  const sliced = hasNext ? rows.slice(0, limit) : rows;

  const logs: WorkspaceAuditLog[] = sliced.map((row) => {
    let parsedDetails: Record<string, unknown> | null = null;
    if (row.details) {
      try {
        parsedDetails = JSON.parse(row.details);
      } catch {
        parsedDetails = null;
      }
    }

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      actorId: row.actor_id,
      action: row.action as WorkspaceAuditLog["action"],
      targetType: row.target_type as WorkspaceAuditLog["targetType"],
      targetId: row.target_id,
      details: parsedDetails,
      createdAt: row.created_at,
      actorName: row.actor_name ?? undefined,
      actorEmail: row.actor_email ?? undefined,
      actorImage: row.actor_image,
    };
  });

  const nextCursor =
    hasNext && sliced.length > 0 ? sliced[sliced.length - 1].created_at : undefined;

  return {
    logs,
    nextCursor,
  };
}
