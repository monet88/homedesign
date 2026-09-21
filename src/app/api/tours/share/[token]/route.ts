import { getCloudflareContext } from "@opennextjs/cloudflare";
import { designErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { getTourByShareToken } from "@/lib/panorama/tour-service";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token: shareToken } = await ctx.params;
  let cf = null;
  try {
    cf = await getCloudflareContext({ async: true });
  } catch {
    // Ignore in non-cf environment
  }
  const env = cf?.env as unknown as Env;

  try {
    let tour = null;
    if (env?.DB) {
      tour = await getTourByShareToken(env.DB, shareToken);
    } else if (shareToken === "demo-penthouse") {
      const { getDemoPenthouseTour } = await import("@/lib/panorama/demo-tour");
      tour = getDemoPenthouseTour();
    }

    if (!tour) {
      return Response.json(
        { error: "NOT_FOUND", message: "Bản xem thực tế ảo không tồn tại hoặc đã bị ẩn" },
        { status: 404 }
      );
    }

    let branding = null;
    if (tour.workspaceId) {
      try {
        const { getWorkspaceBranding } = await import("@/lib/branding/branding-service");
        branding = await getWorkspaceBranding(env, tour.workspaceId);
      } catch {
        // Fallback to null if workspace branding is unavailable
      }
    }

    return Response.json({
      code: 0,
      data: {
        success: true,
        tour,
        branding,
      },
    });
  } catch (err: unknown) {
    return designErrorResponse(err);
  }
}
