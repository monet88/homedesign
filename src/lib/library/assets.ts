// Ticket 08 — Asset library queries and delete-with-warn.

import { deleteAsset } from "@/lib/intake/intake-service";
import type { Env } from "@/lib/bindings";
import { decodeCursor, nextCursor } from "@/lib/library/cursor";
import type { AssetFilters, AssetListItem, ListResult } from "@/lib/library/types";

const ASSET_PAGE_SIZE = 24;

const ALLOWED_SORTS: Record<string, { column: string; dir: "asc" | "desc"; valueKey: keyof AssetListItem }> = {
  "updated-desc": { column: "a.updated_at", dir: "desc", valueKey: "updatedAt" },
  "created-desc": { column: "a.created_at", dir: "desc", valueKey: "createdAt" },
  "name-asc": { column: "a.name", dir: "asc", valueKey: "name" },
};

export async function listAssets(
  env: Env,
  userId: string,
  filters: AssetFilters = {},
  cursorInput?: string | null
): Promise<ListResult<AssetListItem>> {
  const sortKey = filters.sort ?? "updated-desc";
  const sort = ALLOWED_SORTS[sortKey] ?? ALLOWED_SORTS["updated-desc"];
  const cursor = decodeCursor<string | number>(cursorInput ?? null);
  if (cursor && cursor.sort !== sortKey) {
    // Sort changed — ignore stale cursor.
  }

  const conditions: string[] = ["a.user_id = ?1"];
  const params: (string | number)[] = [userId];
  let paramIdx = 1;

  if (filters.lifecycle) {
    paramIdx++;
    conditions.push(`a.lifecycle = ?${paramIdx}`);
    params.push(filters.lifecycle);
  }

  if (filters.search?.trim()) {
    paramIdx++;
    conditions.push(`LOWER(a.name) LIKE ?${paramIdx}`);
    params.push(`%${filters.search.trim().toLowerCase()}%`);
  }

  if (filters.projectId) {
    paramIdx++;
    conditions.push(`EXISTS (SELECT 1 FROM project_assets pa WHERE pa.asset_id = a.id AND pa.project_id = ?${paramIdx})`);
    params.push(filters.projectId);
  }

  const type = filters.type ?? "all";
  if (type === "source") {
    conditions.push(
      `EXISTS (SELECT 1 FROM project_assets pa WHERE pa.asset_id = a.id AND pa.role = 'source')`
    );
  } else if (type === "generated") {
    conditions.push(
      `EXISTS (SELECT 1 FROM project_assets pa WHERE pa.asset_id = a.id AND pa.role = 'generated')`
    );
  }

  const cursorClause = buildCursorClause(cursor, sort, paramIdx);
  if (cursorClause.sql) {
    paramIdx += cursorClause.paramCount;
    conditions.push(cursorClause.sql);
    params.push(...cursorClause.values);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const orderBy = `ORDER BY ${sort.column} ${sort.dir.toUpperCase()}, a.id ${sort.dir.toUpperCase()}`;
  const limitIdx = ++paramIdx;
  const limitSql = `LIMIT ?${limitIdx}`;
  params.push(ASSET_PAGE_SIZE + 1);

  const sql = `
    SELECT
      a.id, a.name, a.mime_type, a.lifecycle, a.created_at, a.updated_at,
      COALESCE((SELECT COUNT(DISTINCT pa.project_id) FROM project_assets pa WHERE pa.asset_id = a.id), 0) AS ref_count,
      EXISTS (SELECT 1 FROM project_assets pa WHERE pa.asset_id = a.id AND pa.role = 'source') AS is_source,
      EXISTS (SELECT 1 FROM project_assets pa WHERE pa.asset_id = a.id AND pa.role = 'generated') AS is_generated
    FROM assets a
    ${where}
    ${orderBy}
    ${limitSql}
  `;

  const result = await env.DB.prepare(sql).bind(...params).all<{
    id: string;
    name: string;
    mime_type: string;
    lifecycle: string;
    created_at: number;
    updated_at: number;
    ref_count: number;
    is_source: number;
    is_generated: number;
  }>();

  const rows = result.results ?? [];
  const hasMore = rows.length > ASSET_PAGE_SIZE;
  const items: AssetListItem[] = rows.slice(0, ASSET_PAGE_SIZE).map((row) => ({
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    lifecycle: row.lifecycle,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    refCount: row.ref_count,
    isSource: Boolean(row.is_source),
    isGenerated: Boolean(row.is_generated),
  }));

  const next = hasMore
    ? nextCursor(
        { value: items[items.length - 1][sort.valueKey], id: items[items.length - 1].id },
        sortKey,
        sort.dir
      )
    : null;

  return { items, nextCursor: next };
}

export async function countAssetProjectRefs(env: Env, assetId: string): Promise<number> {
  const result = await env.DB.prepare(
    `SELECT COUNT(DISTINCT project_id) AS cnt FROM project_assets WHERE asset_id = ?1`
  )
    .bind(assetId)
    .first<{ cnt: number }>();
  return result?.cnt ?? 0;
}

export async function deleteOwnerAsset(
  env: Env,
  userId: string,
  assetId: string
): Promise<{ id: string; refCount: number }> {
  const row = await env.DB.prepare(
    `SELECT id, user_id, lifecycle FROM assets WHERE id = ?1`
  )
    .bind(assetId)
    .first<{ id: string; user_id: string | null; lifecycle: string }>();

  if (!row) throw new Error("NOT_FOUND");
  if (row.user_id !== userId) throw new Error("FORBIDDEN");

  const refCount = await countAssetProjectRefs(env, assetId);
  const deleted = await deleteAsset(env, assetId);
  if (deleted === null) {
    // Already deleted or not found after ownership check.
    throw new Error("NOT_FOUND");
  }
  return { id: deleted, refCount };
}

function buildCursorClause(
  cursor: ReturnType<typeof decodeCursor<string | number>>,
  sort: { column: string; dir: "asc" | "desc" },
  startIdx: number
) {
  if (!cursor) return { sql: "", values: [] as (string | number)[], paramCount: 0 };
  const operator = sort.dir === "asc" ? ">" : "<";
  const p1 = `?${startIdx + 1}`;
  const p2 = `?${startIdx + 2}`;
  return {
    sql: `(${sort.column}, a.id) ${operator} (${p1}, ${p2})`,
    values: [cursor.value, cursor.id],
    paramCount: 2,
  };
}
