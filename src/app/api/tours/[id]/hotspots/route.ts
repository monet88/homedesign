import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { addHotspot, deleteHotspot } from "@/lib/panorama/tour-service";
import { CreateHotspotSchema } from "@/lib/panorama/types";

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const rawBody = await readJson(request);
  if (rawBody instanceof Response) return rawBody;

  const parse = CreateHotspotSchema.safeParse(rawBody);
  if (!parse.success) {
    return Response.json(
      { error: "VALIDATION_ERROR", details: parse.error.format() },
      { status: 400 }
    );
  }

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    const hotspot = await addHotspot(env.DB, auth.userId, parse.data);
    if (!hotspot) {
      return Response.json(
        { error: "FORBIDDEN", message: "Không tìm thấy Scene hoặc không có quyền" },
        { status: 403 }
      );
    }

    return Response.json({
      code: 0,
      data: {
        success: true,
        hotspot,
      },
    });
  } catch (err: unknown) {
    return designErrorResponse(err);
  }
}

export async function DELETE(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const hotspotId = url.searchParams.get("hotspotId");
  if (!hotspotId) {
    return Response.json({ error: "BAD_REQUEST", message: "Thiếu hotspotId" }, { status: 400 });
  }

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    const deleted = await deleteHotspot(env.DB, hotspotId, auth.userId);
    if (!deleted) {
      return Response.json(
        { error: "FORBIDDEN", message: "Không thể xóa Hotspot" },
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
