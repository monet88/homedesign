import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { allocateCreditsToWorkspace } from "@/lib/workspaces/workspaces";

export async function POST(
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

  const body = rawBody as { amount?: number };
  const amount = Number(body?.amount);

  if (!amount || amount <= 0 || !Number.isInteger(amount)) {
    return Response.json(
      { error: "INVALID_AMOUNT", message: "Số credits phân bổ phải là số nguyên dương" },
      { status: 400 }
    );
  }

  try {
    const balances = await allocateCreditsToWorkspace(env, workspaceId, auth.userId, amount);
    return Response.json({
      code: 0,
      data: {
        success: true,
        allocatedAmount: amount,
        ...balances,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (msg === "INSUFFICIENT_PERSONAL_CREDITS") {
      return Response.json(
        { error: "INSUFFICIENT_CREDITS", message: "Số dư credits cá nhân của bạn không đủ để phân bổ" },
        { status: 402 }
      );
    }
    if (msg === "FORBIDDEN_PERMISSION_DENIED") {
      return Response.json(
        { error: "FORBIDDEN", message: "Chỉ chủ sở hữu workspace mới có thể phân bổ credits" },
        { status: 403 }
      );
    }
    return designErrorResponse(err);
  }
}
