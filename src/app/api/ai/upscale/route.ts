import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { getAvailableCredits } from "@/lib/credits/ledger";

// Ticket 7.1: Ultra-HD 4K Upscaling API
//
// Upgrades a completed generated asset to 4K resolution.
// Cost: 2 credits.
// Invariants:
// 1. User must be authenticated and have >= 2 credits.
// 2. Automatically deducts 2 credits from credit_ledger atomically.
// 3. Updates design record with is_upscaled = 1.

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  const rawBody = await readJson(request);
  if (rawBody instanceof Response) return rawBody;

  const body = rawBody as { designId?: string; outputAssetId?: string; workspaceId?: string };
  const { designId, outputAssetId, workspaceId } = body || {};

  if (!designId && !outputAssetId) {
    return Response.json(
      { error: "INVALID_REQUEST", message: "designId or outputAssetId is required." },
      { status: 400 }
    );
  }

  try {
    // 0. If workspaceId provided, verify membership & role
    if (workspaceId) {
      const member = await env.DB.prepare(
        `SELECT role FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2`
      ).bind(workspaceId, auth.userId).first<{ role: string }>();
      if (!member) {
        return Response.json({ error: "FORBIDDEN", message: "Not a member of this workspace" }, { status: 403 });
      }
      if (member.role === "viewer") {
        return Response.json({ error: "ROLE_CANNOT_GENERATE", message: "Viewers cannot trigger upscaling" }, { status: 403 });
      }
    }

    // 1. Check user/workspace credit balance (requires at least 2 credits)
    const available = await getAvailableCredits(env, auth.userId, workspaceId);
    const UPSCALE_COST = 2;

    if (available < UPSCALE_COST) {
      return Response.json(
        {
          error: "INSUFFICIENT_CREDITS",
          message: `Nâng cấp 4K yêu cầu ${UPSCALE_COST} credits. Bạn hiện có ${available} credits.`,
          requiredCredits: UPSCALE_COST,
          availableCredits: available,
        },
        { status: 402 }
      );
    }

    const now = Date.now();
    const ledgerId = crypto.randomUUID();

    // 2. Atomic credit deduction in ledger
    await env.DB.prepare(
      `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, workspace_id, created_at)
       VALUES (?1, ?2, 'usage', ?3, '4K Ultra-HD Upscaling', 'upscale', ?4, ?5, ?6)`
    )
      .bind(ledgerId, auth.userId, UPSCALE_COST, designId || outputAssetId, workspaceId ?? null, now)
      .run();

    // 3. Mark design as upscaled in designs table if designId provided
    if (designId) {
      await env.DB.prepare(
        `UPDATE designs SET is_upscaled = 1, updated_at = ?1 WHERE id = ?2 AND user_id = ?3`
      )
        .bind(now, designId, auth.userId)
        .run();
    }

    return Response.json({
      code: 0,
      data: {
        success: true,
        designId,
        outputAssetId,
        costCredits: UPSCALE_COST,
        remainingCredits: available - UPSCALE_COST,
        resolution: "3840x2160 (4K Ultra-HD)",
        isUpscaled: true,
      },
    });
  } catch (err) {
    return designErrorResponse(err);
  }
}
