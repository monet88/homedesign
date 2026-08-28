import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import { getDesignStatus } from "@/lib/ai/lifecycle";
import { DesignQuerySchema } from "@/lib/validation/schemas";
import type { Env } from "@/lib/bindings";

// `POST /api/ai/query` — spec browser poll contract (ticket #44).
// Body:  { taskId: string }
// Response: { code: 0, data: { id, status, internalStatus, outputAssetId, ... } }

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const body = await readJson(request);
  if (body instanceof Response) return body;

  const parsed = DesignQuerySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_REQUEST", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const view = await getDesignStatus(
      auth.env as unknown as Env,
      auth.userId,
      parsed.data.taskId
    );
    return Response.json(
      { code: 0, data: view },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return designErrorResponse(err);
  }
}

