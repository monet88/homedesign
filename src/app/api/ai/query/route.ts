import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import { getDesignStatus } from "@/lib/ai/lifecycle";
import type { Env } from "@/lib/bindings";

// `POST /api/ai/query` — spec browser poll contract.
// Body:  { taskId: string }
// Response: { code: 0, data: { id, status, internalStatus, outputAssetId, ... } }

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const body = await readJson(request);
  if (body instanceof Response) return body;

  const taskId = (body as { taskId?: unknown }).taskId;
  if (typeof taskId !== "string" || taskId.length === 0) {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    const view = await getDesignStatus(auth.env as unknown as Env, auth.userId, taskId);
    return Response.json(
      { code: 0, data: view },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return designErrorResponse(err);
  }
}
