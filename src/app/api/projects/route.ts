import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { listProjects } from "@/lib/library/projects";
import type { ProjectFilters } from "@/lib/library/types";

// `GET /api/projects` (ticket #08): list the current verified user's Projects.
// Query: kind, favorite, visibility, search, sort, cursor.
// Response: { code:0, data:{ items, nextCursor } }

export async function GET(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const filters: ProjectFilters = {
    kind: parseKind(url.searchParams.get("kind")),
    favorite: parseBool(url.searchParams.get("favorite")),
    visibility: url.searchParams.get("visibility") ?? null,
    search: url.searchParams.get("search") ?? null,
    sort: parseSort(url.searchParams.get("sort")),
    workspaceId: url.searchParams.get("workspaceId") ?? null,
  };
  const cursor = url.searchParams.get("cursor");

  try {
    const result = await listProjects(auth.env as unknown as Env, auth.userId, filters, cursor);
    return Response.json({ code: 0, data: result }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return designErrorResponse(err);
  }
}

function parseKind(value: string | null): ProjectFilters["kind"] {
  if (!value) return null;
  if (value === "interior" || value === "exterior" || value === "floor-plan") return value;
  return null;
}

function parseBool(value: string | null): boolean | null {
  if (value === null || value === "") return null;
  return value === "true" || value === "1";
}

function parseSort(value: string | null): ProjectFilters["sort"] {
  if (!value) return null;
  if (value === "updated-desc" || value === "created-desc" || value === "name-asc") return value;
  return null;
}
