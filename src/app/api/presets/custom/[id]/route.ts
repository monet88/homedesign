import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { deleteCustomPreset, getCustomPreset } from "@/lib/presets/custom-presets";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeVerified(_request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    const preset = await getCustomPreset(env, id, auth.userId);
    return Response.json({ code: 0, data: { preset } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (msg === "PRESET_NOT_FOUND") {
      return Response.json({ error: "PRESET_NOT_FOUND" }, { status: 404 });
    }
    return designErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeVerified(_request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    await deleteCustomPreset(env, id, auth.userId);
    return Response.json({ code: 0, data: { success: true } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (msg === "PRESET_NOT_FOUND") {
      return Response.json({ error: "PRESET_NOT_FOUND" }, { status: 404 });
    }
    if (msg === "FORBIDDEN") {
      return Response.json({ error: "FORBIDDEN", message: "Bạn không có quyền xóa preset này" }, { status: 403 });
    }
    return designErrorResponse(err);
  }
}
