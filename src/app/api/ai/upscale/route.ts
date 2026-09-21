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

    // Verify target design exists and belongs to caller
    if (designId) {
      const design = await env.DB.prepare(
        `SELECT id, is_upscaled, output_asset_id FROM designs WHERE id = ?1 AND user_id = ?2`
      ).bind(designId, auth.userId).first<{ id: string; is_upscaled: number | null; output_asset_id: string | null }>();

      if (!design) {
        return Response.json({ error: "NOT_FOUND", message: "Design not found or access denied" }, { status: 404 });
      }
      if (design.is_upscaled === 1) {
        return Response.json({
          code: 0,
          data: {
            success: true,
            designId,
            outputAssetId: design.output_asset_id,
            alreadyUpscaled: true,
            resolution: "3840x2160 (4K Ultra-HD)",
            isUpscaled: true,
          },
        });
      }
    }

    // Guard: Upscale provider worker pipeline is not yet wired to production models.
    // Return 503 rather than silently charging 2 credits for an un-generated asset.
    return Response.json(
      {
        error: "SERVICE_UNAVAILABLE",
        message: "Tính năng 4K Ultra-HD Upscaling đang được nâng cấp hạ tầng provider. Credits chưa bị trừ.",
      },
      { status: 503 }
    );
  } catch (err) {
    return designErrorResponse(err);
  }
}
