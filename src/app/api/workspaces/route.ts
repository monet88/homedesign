import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { createWorkspace, getUserWorkspaces } from "@/lib/workspaces/workspaces";

export async function GET(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    const workspaces = await getUserWorkspaces(env, auth.userId);
    return Response.json({ code: 0, data: { workspaces } });
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

  const body = rawBody as { name?: string; slug?: string };
  const name = body?.name?.trim();

  if (!name) {
    return Response.json(
      { error: "INVALID_REQUEST", message: "Workspace name is required" },
      { status: 400 }
    );
  }

  try {
    const workspace = await createWorkspace(env, auth.userId, {
      name,
      slug: body.slug,
    });
    return Response.json({ code: 0, data: { workspace } }, { status: 201 });
  } catch (err) {
    return designErrorResponse(err);
  }
}
