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
    WITH core_events AS (
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
    ),
    extended_events AS (
      SELECT
        'stage:' || sr.id || ':' || sr.status AS event_id,
        'generation' AS family,
        CASE
          WHEN sr.status = 'confirmed' THEN 'stage_confirmed'
          WHEN sr.status IN ('failed', 'expired') THEN 'stage_failed'
          ELSE 'stage_started'
        END AS type,
        COALESCE(sr.confirmed_at, sr.updated_at) AS occurred_at,
        COALESCE(sr.design_id, sr.id) AS reference_id,
        rd.user_id AS actor_user_id,
        rd.marker_id AS name,
        sr.stage AS kind,
        sr.status AS status,
        sr.room_design_id AS detail
      FROM floor_plan_stage_runs sr
      JOIN room_designs rd ON rd.id = sr.room_design_id
      WHERE rd.user_id = ?1

      UNION ALL

      SELECT
        CASE WHEN ps.revoked_at IS NULL THEN 'share:' || ps.id ELSE 'share-revoke:' || ps.id END AS event_id,
        'project' AS family,
        CASE
          WHEN ps.revoked_at IS NULL THEN 'project_share_created'
          ELSE 'project_share_revoked'
        END AS type,
        COALESCE(ps.revoked_at, ps.created_at) AS occurred_at,
        ps.project_id AS reference_id,
        p.user_id AS actor_user_id,
        p.name AS name,
        'share' AS kind,
        CASE WHEN ps.revoked_at IS NULL THEN 'active' ELSE 'revoked' END AS status,
        ps.expires_at AS detail
      FROM project_shares ps
      JOIN projects p ON p.id = ps.project_id
      WHERE p.user_id = ?1

      UNION ALL

      SELECT
        'project-meta:' || p.id || ':' || p.updated_at AS event_id,
        'project' AS family,
        CASE
          WHEN p.favorite = 1 THEN 'project_favorited'
          ELSE 'project_visibility_changed'
        END AS type,
        p.updated_at AS occurred_at,
        p.id AS reference_id,
        p.user_id AS actor_user_id,
        p.name AS name,
        p.kind AS kind,
        CASE WHEN p.favorite = 1 THEN 'favorite' ELSE p.visibility END AS status,
        p.visibility AS detail
      FROM projects p
      WHERE p.user_id = ?1 AND (p.favorite = 1 OR p.visibility != 'private')
    ),
    events AS (
      SELECT * FROM core_events
      UNION ALL
      SELECT * FROM extended_events
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
