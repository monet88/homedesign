import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { deleteWorkspace, getWorkspace } from "@/lib/workspaces/workspaces";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeVerified(_request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    const workspace = await getWorkspace(env, id, auth.userId);
    return Response.json({ code: 0, data: { workspace } });
  } catch (err) {
    return designErrorResponse(err);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeVerified(_request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    await deleteWorkspace(env, id, auth.userId);
    return Response.json({ code: 0, data: { success: true } });
  } catch (err) {
    return designErrorResponse(err);
  }
}
