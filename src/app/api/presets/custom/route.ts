import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { createCustomPreset, listCustomPresets } from "@/lib/presets/custom-presets";

export async function GET(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const scene = url.searchParams.get("scene") || undefined;

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    const presets = await listCustomPresets(env, auth.userId, workspaceId, scene);
    return Response.json({ code: 0, data: { presets } });
  } catch (err) {
    return designErrorResponse(err);
  }
}

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  const rawBody = await readJson(request);
  if (rawBody instanceof Response) return rawBody;

  const body = rawBody as {
    name?: string;
    description?: string;
    workspaceId?: string;
    scene?: "interior" | "exterior" | "floor-plan" | "all";
    roomType?: string;
    baseStyle?: string;
    colorPalette?: string;
    preferredMaterials?: string[];
    customPromptAdditions?: string;
    negativePromptAdditions?: string;
  };

  if (!body?.name?.trim()) {
    return Response.json(
      { error: "INVALID_REQUEST", message: "Tên preset là bắt buộc" },
      { status: 400 }
    );
  }

  const name = body.name.trim();

  try {
    const preset = await createCustomPreset(env, auth.userId, {
      ...body,
      name,
    });
    return Response.json({ code: 0, data: { preset } }, { status: 201 });
  } catch (err) {
    return designErrorResponse(err);
  }
}
