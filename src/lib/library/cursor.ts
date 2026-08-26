// Ticket 08 — opaque cursor helpers for server-side pagination.
// Cursor encodes { value, id, sort, dir } as base64 JSON. The value is the
// sort-column value of the last row; id is the stable tie-breaker.

export interface ListCursor<T = unknown> {
  value: T;
  id: string;
  sort: string;
  dir: "asc" | "desc";
}

export function encodeCursor<T>(cursor: ListCursor<T>): string {
  const json = JSON.stringify(cursor);
  return btoa(json);
}

export function decodeCursor<T = unknown>(input: string | null): ListCursor<T> | null {
  if (!input) return null;
  try {
    const json = atob(input);
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const c = parsed as Record<string, unknown>;
    if (typeof c.id !== "string" || typeof c.sort !== "string" || !c.dir) return null;
    return c as unknown as ListCursor<T>;
  } catch {
    return null;
  }
}

export function nextCursor<T>(last: { value: T; id: string }, sort: string, dir: "asc" | "desc"): string {
  return encodeCursor({ value: last.value, id: last.id, sort, dir });
}
