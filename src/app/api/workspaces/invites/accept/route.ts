import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { acceptInvite, getInviteByToken } from "@/lib/workspaces/workspaces";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return Response.json({ error: "TOKEN_REQUIRED" }, { status: 400 });
  }

  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as Env;

  try {
    const invite = await getInviteByToken(env, token);
    return Response.json({ code: 0, data: { invite } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (msg === "INVITE_NOT_FOUND") return Response.json({ error: "INVITE_NOT_FOUND" }, { status: 404 });
    if (msg === "INVITE_EXPIRED") return Response.json({ error: "INVITE_EXPIRED" }, { status: 410 });
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  const rawBody = await readJson(request);
  if (rawBody instanceof Response) return rawBody;

  const body = rawBody as { token?: string };
  const token = body?.token?.trim();

  if (!token) {
    return Response.json({ error: "TOKEN_REQUIRED" }, { status: 400 });
  }

  try {
    const result = await acceptInvite(env, token, auth.userId, auth.userEmail || "");
    return Response.json({ code: 0, data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (msg === "EMAIL_MISMATCH") {
      return Response.json(
        { error: "EMAIL_MISMATCH", message: "Lời mời này dành cho một địa chỉ email khác." },
        { status: 403 }
      );
    }
    if (msg === "INVITE_NOT_FOUND") return Response.json({ error: "INVITE_NOT_FOUND" }, { status: 404 });
    if (msg === "INVITE_EXPIRED") return Response.json({ error: "INVITE_EXPIRED" }, { status: 410 });
    return designErrorResponse(err);
  }
}
