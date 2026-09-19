// Ticket 08 — Project library queries and mutations.

import type { Env } from "@/lib/bindings";
import { decodeCursor, nextCursor } from "@/lib/library/cursor";
import type { ListResult, ProjectFilters, ProjectListItem } from "@/lib/library/types";

const PROJECT_PAGE_SIZE = 24;

const ALLOWED_SORTS: Record<string, { column: string; dir: "asc" | "desc"; valueKey: keyof ProjectListItem }> = {
  "updated-desc": { column: "updated_at", dir: "desc", valueKey: "updatedAt" },
  "created-desc": { column: "created_at", dir: "desc", valueKey: "createdAt" },
  "name-asc": { column: "name", dir: "asc", valueKey: "name" },
};

export async function listProjects(
  env: Env,
  userId: string,
  filters: ProjectFilters = {},
  cursorInput?: string | null
): Promise<ListResult<ProjectListItem>> {
  const sortKey = filters.sort ?? "updated-desc";
  const sort = ALLOWED_SORTS[sortKey] ?? ALLOWED_SORTS["updated-desc"];
  const cursor = decodeCursor<string | number>(cursorInput ?? null);
  if (cursor && cursor.sort !== sortKey) {
    // Sort changed — ignore stale cursor.
  }

  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramIdx = 0;

  if (filters.workspaceId) {
    paramIdx++;
    conditions.push(`p.workspace_id = ?${paramIdx}`);
    params.push(filters.workspaceId);
    paramIdx++;
    conditions.push(
      `EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = p.workspace_id AND wm.user_id = ?${paramIdx})`
    );
    params.push(userId);
  } else {
    paramIdx++;
    conditions.push(`p.user_id = ?${paramIdx}`);
    params.push(userId);
  }

  if (filters.kind) {
    paramIdx++;
    conditions.push(`p.kind = ?${paramIdx}`);
    params.push(filters.kind);
  }
  if (filters.favorite !== undefined && filters.favorite !== null) {
    paramIdx++;
    conditions.push(`p.favorite = ?${paramIdx}`);
    params.push(filters.favorite ? 1 : 0);
  }
  if (filters.visibility) {
    paramIdx++;
    conditions.push(`p.visibility = ?${paramIdx}`);
    params.push(filters.visibility);
  }
  if (filters.search?.trim()) {
    paramIdx++;
    conditions.push(`LOWER(p.name) LIKE ?${paramIdx}`);
    params.push(`%${filters.search.trim().toLowerCase()}%`);
  }

  const cursorClause = buildCursorClause(cursor, sort, paramIdx);
  if (cursorClause.sql) {
    paramIdx += cursorClause.paramCount;
    conditions.push(cursorClause.sql);
    params.push(...cursorClause.values);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const orderBy = `ORDER BY ${sort.column} ${sort.dir.toUpperCase()}, p.id ${sort.dir.toUpperCase()}`;
  const limitIdx = ++paramIdx;
  const limitSql = `LIMIT ?${limitIdx}`;
  params.push(PROJECT_PAGE_SIZE + 1);

  const sql = `
    SELECT p.id, p.name, p.kind, p.status, p.favorite, p.visibility, p.created_at, p.updated_at, p.source_asset_id, p.workspace_id
    FROM projects p
    ${where}
    ${orderBy}
    ${limitSql}
  `;

  let rows: Array<{
    id: string;
    name: string;
    kind: string;
    status: string;
    favorite: number;
    visibility: string;
    created_at: number;
    updated_at: number;
    source_asset_id: string | null;
    workspace_id?: string | null;
  }> = [];

  try {
    const result = await env.DB.prepare(sql).bind(...params).all<{
      id: string;
      name: string;
      kind: string;
      status: string;
      favorite: number;
      visibility: string;
      created_at: number;
      updated_at: number;
      source_asset_id: string | null;
      workspace_id: string | null;
    }>();
    rows = result.results ?? [];
  } catch (err) {
    if (!filters.workspaceId && String(err).includes("no such column: p.workspace_id")) {
      const fallbackSql = `
        SELECT p.id, p.name, p.kind, p.status, p.favorite, p.visibility, p.created_at, p.updated_at, p.source_asset_id
        FROM projects p
        ${where}
        ${orderBy}
        ${limitSql}
      `;
      const fallbackResult = await env.DB.prepare(fallbackSql).bind(...params).all<{
        id: string;
        name: string;
        kind: string;
        status: string;
        favorite: number;
        visibility: string;
        created_at: number;
        updated_at: number;
        source_asset_id: string | null;
      }>();
      rows = fallbackResult.results ?? [];
    } else {
      throw err;
    }
  }
  const hasMore = rows.length > PROJECT_PAGE_SIZE;
  const items: ProjectListItem[] = rows.slice(0, PROJECT_PAGE_SIZE).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind as ProjectListItem["kind"],
    status: row.status,
    favorite: Boolean(row.favorite),
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceAssetId: row.source_asset_id,
    workspaceId: row.workspace_id ?? null,
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

export async function toggleProjectFavorite(
  env: Env,
  userId: string,
  projectId: string,
  favorite: boolean
): Promise<void> {
  const result = await env.DB.prepare(
    `UPDATE projects SET favorite = ?3, updated_at = ?4 WHERE id = ?1 AND user_id = ?2`
  )
    .bind(projectId, userId, favorite ? 1 : 0, Date.now())
    .run();
  if (result.meta.changes === 0) {
    const row = await env.DB.prepare(`SELECT 1 FROM projects WHERE id = ?1`).bind(projectId).first();
    if (!row) throw new Error("NOT_FOUND");
    throw new Error("FORBIDDEN");
  }
}

function buildCursorClause(
  cursor: ReturnType<typeof decodeCursor<string | number>>,
  sort: { column: string; dir: "asc" | "desc" },
  startIdx: number
) {
  if (!cursor) return { sql: "", values: [] as (string | number)[], paramCount: 0 };
  const operator = sort.dir === "asc" ? ">" : "<";
  const col = sort.column === "name" ? "p.name" : `p.${sort.column}`;
  const p1 = `?${startIdx + 1}`;
  const p2 = `?${startIdx + 2}`;
  return {
    sql: `(${col}, p.id) ${operator} (${p1}, ${p2})`,
    values: [cursor.value, cursor.id],
    paramCount: 2,
  };
}
