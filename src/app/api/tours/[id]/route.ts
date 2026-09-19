import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { getTourById, updateTour, deleteTour } from "@/lib/panorama/tour-service";
import { UpdateTourSchema } from "@/lib/panorama/types";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id: tourId } = await ctx.params;
  const cf = await getCloudflareContext({ async: true });
  const env = (cf?.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    const tour = await getTourById(env.DB, tourId, { includeScenes: true });
    if (!tour) {
      return Response.json(
        { error: "NOT_FOUND", message: "Bản xem thực tế ảo không tồn tại" },
        { status: 404 }
      );
    }

    let isAuthorized = tour.userId === auth.userId;
    if (!isAuthorized && tour.workspaceId) {
      const member = await env.DB.prepare(
        `SELECT role FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2 LIMIT 1`
      )
        .bind(tour.workspaceId, auth.userId)
        .first<{ role: string }>();
      if (member) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return Response.json(
        { error: "FORBIDDEN", message: "Không có quyền truy cập bản xem thực tế ảo này" },
        { status: 403 }
      );
    }

    return Response.json({
      code: 0,
      data: {
        success: true,
        tour,
      },
    });
  } catch (err: unknown) {
    return designErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id: tourId } = await ctx.params;
  const rawBody = await readJson(request);
  if (rawBody instanceof Response) return rawBody;

  const parse = UpdateTourSchema.safeParse(rawBody);
  if (!parse.success) {
    return Response.json(
      { error: "VALIDATION_ERROR", details: parse.error.format() },
      { status: 400 }
    );
  }

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    const updated = await updateTour(env.DB, tourId, auth.userId, parse.data);
    if (!updated) {
      return Response.json(
        { error: "FORBIDDEN", message: "Không có quyền chỉnh sửa hoặc Tour không tồn tại" },
        { status: 403 }
      );
    }

    const tour = await getTourById(env.DB, tourId, { includeScenes: true });
    return Response.json({
      code: 0,
      data: {
        success: true,
        tour,
      },
    });
  } catch (err: unknown) {
    return designErrorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id: tourId } = await ctx.params;
  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    const deleted = await deleteTour(env.DB, tourId, auth.userId);
    if (!deleted) {
      return Response.json(
        { error: "FORBIDDEN", message: "Không thể xóa hoặc không tìm thấy Tour" },
        { status: 403 }
      );
    }

    return Response.json({
      code: 0,
      data: {
        success: true,
      },
    });
  } catch (err: unknown) {
    return designErrorResponse(err);
  }
}
