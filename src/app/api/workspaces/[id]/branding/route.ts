import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { getWorkspaceBranding, updateWorkspaceBranding } from "@/lib/branding/branding-service";
import type { UpdateBrandingInput } from "@/lib/branding/types";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id: workspaceId } = await ctx.params;
  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    const branding = await getWorkspaceBranding(env, workspaceId);
    return Response.json({
      code: 0,
      data: {
        success: true,
        branding,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (msg === "WORKSPACE_NOT_FOUND") {
      return Response.json({ error: "NOT_FOUND", message: "Workspace không tồn tại" }, { status: 404 });
    }
    return designErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id: workspaceId } = await ctx.params;
  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  const rawBody = await readJson(request);
  if (rawBody instanceof Response) return rawBody;

  const body = rawBody as UpdateBrandingInput;

  try {
    const updated = await updateWorkspaceBranding(env, workspaceId, auth.userId, body);
    return Response.json({
      code: 0,
      data: {
        success: true,
        branding: updated,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (msg.includes("FORBIDDEN_PERMISSION_DENIED")) {
      return Response.json(
        { error: "FORBIDDEN", message: "Chỉ chủ sở hữu Studio mới có quyền thay đổi thông tin thương hiệu" },
        { status: 403 }
      );
    }
    return designErrorResponse(err);
  }
}
