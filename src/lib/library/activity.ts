// Ticket 08 — Activity timeline derived from existing domain tables.
//
// Decision: derive the timeline instead of adding an activity_events table.
// The domain tables already store user_id + timestamps + stable ids, so the
// events are idempotent by construction (eventId = `${table}:${row.id}` or
// `${table}:${row.id}:${status}` for generation status changes). Retention is
// enforced by a WHERE occurred_at > cutoff query; older rows are simply not
// returned. This avoids a migration and a separate write path for #8.

import type { Env } from "@/lib/bindings";
import { decodeCursor, nextCursor } from "@/lib/library/cursor";
import type { ActivityEvent, ActivityFilters, ListResult } from "@/lib/library/types";

const ACTIVITY_PAGE_SIZE = 50;
const RETENTION_DAYS = 90;

type ActivityRow = {
  event_id: string;
  family: string;
  type: string;
  occurred_at: number;
  reference_id: string;
  actor_user_id: string;
  name: string;
  kind: string;
  status: string;
  detail: string | number | null;
};

export async function listActivity(
  env: Env,
  userId: string,
  filters: ActivityFilters = {},
  cursorInput?: string | null
): Promise<ListResult<ActivityEvent>> {
  const cursor = decodeCursor<{ value: number; id: string }>(cursorInput ?? null);
  const now = Date.now();
  const cutoff = now - RETENTION_DAYS * 24 * 3600 * 1000;

  const params: (string | number)[] = [userId];
  // ?1 inside the CTE refers to the single userId parameter.
  let paramIdx = 2;

  const conditions: string[] = ["actor_user_id = ?1", `occurred_at > ?${paramIdx++}`];
  params.push(cutoff);

  if (cursor) {
    conditions.push(`(occurred_at, event_id) < (?${paramIdx++}, ?${paramIdx++})`);
    params.push(cursor.value.value, cursor.value.id);
  }

  if (filters.family) {
    conditions.push(`family = ?${paramIdx++}`);
    params.push(filters.family);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const limit = ACTIVITY_PAGE_SIZE + 1;

  const sql = `
    WITH events AS (
      SELECT
        'project:' || p.id AS event_id,
        'project' AS family,
        'project_created' AS type,
        p.created_at AS occurred_at,
        p.id AS reference_id,
        p.user_id AS actor_user_id,
        p.name AS name,
        p.kind AS kind,
        p.status AS status,
        p.visibility AS detail
      FROM projects p
      WHERE p.user_id = ?1

      UNION ALL

      SELECT
        'asset:' || a.id AS event_id,
        'asset' AS family,
        'asset_' || a.lifecycle AS type,
        a.created_at AS occurred_at,
        a.id AS reference_id,
        a.user_id AS actor_user_id,
        a.name AS name,
        a.mime_type AS kind,
        a.lifecycle AS status,
        a.created_by AS detail
      FROM assets a
      WHERE a.user_id = ?1

      UNION ALL

      SELECT
        'generation:' || d.id || ':' || t.status AS event_id,
        'generation' AS family,
        CASE
          WHEN t.status = 'ready' THEN 'generation_succeeded'
          WHEN t.status IN ('failed', 'expired') THEN 'generation_failed'
          ELSE 'generation_started'
        END AS type,
        COALESCE(d.completed_at, d.updated_at) AS occurred_at,
        d.id AS reference_id,
        d.user_id AS actor_user_id,
        p.name AS name,
        d.scene AS kind,
        t.status AS status,
        t.error_code AS detail
      FROM designs d
      JOIN projects p ON p.id = d.project_id
      JOIN ai_tasks t ON t.id = d.id
      WHERE d.user_id = ?1

      UNION ALL

      SELECT
        'payment:' || mp.id AS event_id,
        'payment' AS family,
        'payment_succeeded' AS type,
        mp.created_at AS occurred_at,
        mp.id AS reference_id,
        mp.user_id AS actor_user_id,
        mp.pack AS name,
        'mock' AS kind,
        'success' AS status,
        mp.amount AS detail
      FROM mock_payments mp
      WHERE mp.user_id = ?1
    )
    SELECT *
    FROM events
    ${where}
    ORDER BY occurred_at DESC, event_id DESC
    LIMIT ?${paramIdx++}
  `;
  params.push(limit);
  const result = await env.DB.prepare(sql).bind(...params).all<ActivityRow>();
  const rows = result.results ?? [];
  const hasMore = rows.length > ACTIVITY_PAGE_SIZE;
  const items: ActivityEvent[] = rows.slice(0, ACTIVITY_PAGE_SIZE).map((row) => ({
    eventId: row.event_id,
    family: row.family as ActivityEvent["family"],
    type: row.type,
    occurredAt: row.occurred_at,
    referenceId: row.reference_id,
    actorUserId: row.actor_user_id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    detail: row.detail,
  }));

  const next = hasMore
    ? nextCursor(
        { value: items[items.length - 1].occurredAt, id: items[items.length - 1].eventId },
        "occurredAt",
        "desc"
      )
    : null;

  return { items, nextCursor: next };
}
