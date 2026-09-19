import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { addSceneToTour, deleteScene } from "@/lib/panorama/tour-service";
import { CreateSceneSchema } from "@/lib/panorama/types";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id: tourId } = await ctx.params;
  const rawBody = await readJson(request);
  if (rawBody instanceof Response) return rawBody;

  const parse = CreateSceneSchema.safeParse(rawBody);
  if (!parse.success) {
    return Response.json(
      { error: "VALIDATION_ERROR", details: parse.error.format() },
      { status: 400 }
    );
  }

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    const scene = await addSceneToTour(env.DB, tourId, auth.userId, parse.data);
    if (!scene) {
      return Response.json(
        { error: "FORBIDDEN", message: "Không tìm thấy Tour hoặc không có quyền" },
        { status: 403 }
      );
    }

    return Response.json({
      code: 0,
      data: {
        success: true,
        scene,
      },
    });
  } catch (err: unknown) {
    return designErrorResponse(err);
  }
}

export async function DELETE(
  request: Request
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const sceneId = url.searchParams.get("sceneId");
  if (!sceneId) {
    return Response.json({ error: "BAD_REQUEST", message: "Thiếu sceneId" }, { status: 400 });
  }

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    const deleted = await deleteScene(env.DB, sceneId, auth.userId);
    if (!deleted) {
      return Response.json(
        { error: "FORBIDDEN", message: "Không thể xóa Scene" },
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
