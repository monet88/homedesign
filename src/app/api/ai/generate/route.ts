import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import { createDesign } from "@/lib/ai/lifecycle";
import type { Env } from "@/lib/bindings";

// `POST /api/ai/generate` — origin-compatible alias of `POST /api/designs`
// (issue #7). Same gates, same envelope, same idempotency: the origin client
// only reads `data.id`.
//
// The public schema still rejects `prompt`, `options.image_input`, base64/data
// URLs, object keys and arbitrary URLs — the clone boundary in ADR 0003
// supersedes the origin's inline `image_input` transport.

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const body = await readJson(request);
  if (body instanceof Response) return body;

  try {
    const result = await createDesign(auth.env as unknown as Env, auth.userId, body);
    return Response.json({ code: 0, message: "ok", data: { id: result.id } });
  } catch (err) {
    return designErrorResponse(err);
  }
}
