import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { listAssets } from "@/lib/library/assets";
import type { AssetFilters } from "@/lib/library/types";

// `GET /api/assets` (ticket #08): list the current verified user's Assets.
// Query: type (source|generated|all), lifecycle, projectId, search, sort, cursor.
// Response: { code:0, data:{ items, nextCursor } }

export async function GET(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const filters: AssetFilters = {
    type: parseType(url.searchParams.get("type")),
    lifecycle: url.searchParams.get("lifecycle") ?? null,
    projectId: url.searchParams.get("projectId") ?? null,
    search: url.searchParams.get("search") ?? null,
    sort: parseSort(url.searchParams.get("sort")),
  };
  const cursor = url.searchParams.get("cursor");

  try {
    const result = await listAssets(auth.env as unknown as Env, auth.userId, filters, cursor);
    return Response.json({ code: 0, data: result }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return designErrorResponse(err);
  }
}

function parseType(value: string | null): AssetFilters["type"] {
  if (!value || value === "all") return "all";
  if (value === "source" || value === "generated") return value;
  return "all";
}

function parseSort(value: string | null): AssetFilters["sort"] {
  if (!value) return null;
  if (value === "updated-desc" || value === "created-desc" || value === "name-asc") return value;
  return null;
}
