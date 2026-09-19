import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import {
  createBatchPanoramaTour,
  type BatchPanoramaRoomInput,
} from "@/lib/panorama/batch-panorama";
import { MAX_BATCH_ITEMS } from "@/lib/batch/batch-service";

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  const rawBody = await readJson(request);
  if (rawBody instanceof Response) return rawBody;

  const body = rawBody as {
    tourTitle?: string;
    style?: string;
    palette?: string;
    rooms?: BatchPanoramaRoomInput[];
    autoLinkPortals?: boolean;
    workspaceId?: string;
    projectId?: string;
    provider?: string;
  };

  const tourTitle = body?.tourTitle?.trim();
  if (!tourTitle) {
    return Response.json(
      { error: "INVALID_TITLE", message: "Vui lòng nhập tên công trình / Tour 360°" },
      { status: 400 }
    );
  }

  const rooms = body?.rooms;
  if (!rooms || !Array.isArray(rooms) || rooms.length === 0) {
    return Response.json(
      { error: "INVALID_ROOMS", message: "Vui lòng chọn ít nhất 1 phòng để tạo tour 360°" },
      { status: 400 }
    );
  }

  if (rooms.length > MAX_BATCH_ITEMS) {
    return Response.json(
      {
        error: "BATCH_MAX_ITEMS_EXCEEDED",
        message: `Tối đa ${MAX_BATCH_ITEMS} phòng cho một lượt khởi tạo Tour 360°`,
      },
      { status: 400 }
    );
  }

  const ALLOWED_PROVIDERS = new Set(["fal", "gemini", "replicate", "kie", "smart", "default", "fake"]);
  if (body.provider && !ALLOWED_PROVIDERS.has(body.provider.toLowerCase().trim())) {
    return Response.json(
      { error: "INVALID_PROVIDER", message: "Nhà cung cấp AI không hợp lệ" },
      { status: 400 }
    );
  }

  const style = body?.style?.trim() || "Modern Luxury";

  try {
    const result = await createBatchPanoramaTour(env, {
      userId: auth.userId,
      workspaceId: body.workspaceId,
      projectId: body.projectId,
      tourTitle,
      style,
      palette: body.palette,
      rooms,
      autoLinkPortals: body.autoLinkPortals !== false,
      provider: body.provider,
    });

    return Response.json({
      code: 0,
      data: {
        success: true,
        ...result,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (msg.includes("FORBIDDEN")) {
      return Response.json(
        {
          error: "FORBIDDEN",
          message: "Bạn không phải thành viên của workspace này",
        },
        { status: 403 }
      );
    }
    if (msg.includes("ROLE_CANNOT_GENERATE")) {
      return Response.json(
        {
          error: "ROLE_CANNOT_GENERATE",
          message: "Viewer không có quyền tạo batch panorama trong workspace này",
        },
        { status: 403 }
      );
    }
    if (msg.includes("INSUFFICIENT_CREDITS")) {
      return Response.json(
        {
          error: "INSUFFICIENT_CREDITS",
          message: "Số dư credits không đủ để khởi tạo trọn bộ Tour 360° căn hộ này",
        },
        { status: 402 }
      );
    }
    return designErrorResponse(err);
  }
}
