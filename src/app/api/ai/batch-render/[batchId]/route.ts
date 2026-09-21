import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { getBatchRenderJob } from "@/lib/batch/batch-service";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ batchId: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { batchId } = await ctx.params;
  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    const job = await getBatchRenderJob(env, batchId, auth.userId);
    if (!job) {
      return Response.json(
        { error: "NOT_FOUND", message: "Không tìm thấy tác vụ batch này" },
        { status: 404 }
      );
    }

    return Response.json({
      code: 0,
      data: {
        success: true,
        batch: job,
      },
    });
  } catch (err: unknown) {
    return designErrorResponse(err);
  }
}
