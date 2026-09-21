import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { getWorkspace } from "@/lib/workspaces/workspaces";
import { listWorkspaceAuditLogs } from "@/lib/audit/audit-logger";
import type { AuditAction } from "@/lib/audit/types";

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
    const ws = await getWorkspace(env, workspaceId, auth.userId);

    // RBAC: Only owner and architect can inspect studio audit logs.
    if (ws.role !== "owner" && ws.role !== "architect") {
      return Response.json(
        {
          error: "FORBIDDEN_VIEWER_ROLE",
          message: "Thành viên vai trò Viewer không có quyền xem nhật ký kiểm toán của Studio",
        },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20;
    const cursor = url.searchParams.get("cursor") ? Number(url.searchParams.get("cursor")) : undefined;
    const action = (url.searchParams.get("action") as AuditAction) || undefined;
    const actorId = url.searchParams.get("actorId") || undefined;

    const data = await listWorkspaceAuditLogs(env, workspaceId, {
      limit,
      cursor,
      action,
      actorId,
    });

    return Response.json({
      code: 0,
      data: {
        success: true,
        logs: data.logs,
        nextCursor: data.nextCursor,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (msg === "WORKSPACE_NOT_FOUND_OR_ACCESS_DENIED") {
      return Response.json(
        { error: "NOT_FOUND", message: "Workspace không tồn tại hoặc bạn không có quyền truy cập" },
        { status: 404 }
      );
    }
    return designErrorResponse(err);
  }
}
