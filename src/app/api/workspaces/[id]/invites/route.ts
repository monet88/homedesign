import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { inviteMember } from "@/lib/workspaces/workspaces";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id: workspaceId } = await ctx.params;
  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  const rawBody = await readJson(request);
  if (rawBody instanceof Response) return rawBody;

  const body = rawBody as { email?: string; role?: "architect" | "viewer" };
  const email = body?.email?.trim();
  const role = body?.role === "viewer" ? "viewer" : "architect";

  if (!email) {
    return Response.json(
      { error: "INVALID_REQUEST", message: "Email is required" },
      { status: 400 }
    );
  }

  try {
    const invite = await inviteMember(env, workspaceId, auth.userId, email, role);
    return Response.json({ code: 0, data: { invite } }, { status: 201 });
  } catch (err) {
    return designErrorResponse(err);
  }
}
