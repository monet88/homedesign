import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { listActivity } from "@/lib/library/activity";
import type { ActivityFilters } from "@/lib/library/types";

// `GET /api/activity` (ticket #08): owner-only timeline derived from domain tables.
// Query: family (project|asset|generation|payment), cursor.
// Response: { code:0, data:{ items, nextCursor } }

export async function GET(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const family = url.searchParams.get("family");
  const filters: ActivityFilters = {
    family: isActivityFamily(family) as ActivityFilters["family"],
  };
  const cursor = url.searchParams.get("cursor");

  try {
    const result = await listActivity(auth.env as unknown as Env, auth.userId, filters, cursor);
    return Response.json({ code: 0, data: result }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return designErrorResponse(err);
  }
}

function isActivityFamily(value: string | null): ActivityFilters["family"] {
  if (value === "project" || value === "asset" || value === "generation" || value === "payment") {
    return value as ActivityFilters["family"];
  }
  return null;
}
