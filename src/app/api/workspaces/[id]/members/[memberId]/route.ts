import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { removeMember, updateMemberRole } from "@/lib/workspaces/workspaces";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; memberId: string }> }
) {
  const auth = await authorizeVerified(_request);
  if (auth instanceof Response) return auth;

  const { id: workspaceId, memberId } = await ctx.params;
  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    await removeMember(env, workspaceId, memberId, auth.userId);
    return Response.json({ code: 0, data: { success: true } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (msg === "CANNOT_REMOVE_OWNER") {
      return Response.json({ error: "CANNOT_REMOVE_OWNER", message: "Không thể xóa chủ sở hữu workspace" }, { status: 400 });
    }
    if (msg === "FORBIDDEN_PERMISSION_DENIED") {
      return Response.json({ error: "FORBIDDEN", message: "Bạn không có quyền thực hiện thao tác này" }, { status: 403 });
    }
    return designErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; memberId: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id: workspaceId, memberId } = await ctx.params;
  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  const rawBody = await readJson(request);
  if (rawBody instanceof Response) return rawBody;

  const body = rawBody as { role?: "architect" | "viewer" };
  const role = body?.role;

  if (role !== "architect" && role !== "viewer") {
    return Response.json(
      { error: "INVALID_REQUEST", message: "Role must be 'architect' or 'viewer'" },
      { status: 400 }
    );
  }

  try {
    await updateMemberRole(env, workspaceId, memberId, role, auth.userId);
    return Response.json({ code: 0, data: { success: true, role } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (msg === "CANNOT_CHANGE_OWNER_ROLE") {
      return Response.json({ error: "CANNOT_CHANGE_OWNER_ROLE", message: "Không thể đổi vai trò của chủ sở hữu" }, { status: 400 });
    }
    if (msg === "FORBIDDEN_PERMISSION_DENIED") {
      return Response.json({ error: "FORBIDDEN", message: "Bạn không có quyền thực hiện thao tác này" }, { status: 403 });
    }
    return designErrorResponse(err);
  }
}
