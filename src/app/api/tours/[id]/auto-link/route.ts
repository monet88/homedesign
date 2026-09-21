import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { autoLinkTourScenes } from "@/lib/panorama/batch-panorama";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  const { id: tourId } = await params;
  if (!tourId) {
    return Response.json({ error: "INVALID_TOUR_ID", message: "Thiếu mã định danh tour" }, { status: 400 });
  }

  let strategy: "hub_and_spoke" | "sequential" = "hub_and_spoke";
  try {
    const rawBody = await readJson(request);
    if (
      !(rawBody instanceof Response) &&
      rawBody &&
      typeof rawBody === "object" &&
      "strategy" in rawBody &&
      (rawBody as { strategy?: string }).strategy === "sequential"
    ) {
      strategy = "sequential";
    }
  } catch {
    // default to hub_and_spoke if body empty
  }

  try {
    const result = await autoLinkTourScenes(env.DB, tourId, auth.userId, strategy);
    if (!result.success) {
      return Response.json(
        { error: "AUTO_LINK_FAILED", message: result.message || "Không thể tự động liên kết phòng" },
        { status: 400 }
      );
    }

    return Response.json({
      code: 0,
      data: result,
    });
  } catch (err: unknown) {
    return designErrorResponse(err);
  }
}
