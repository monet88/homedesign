import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolveSession, type AuthEnv } from "@/lib/auth/server";

// `GET /api/auth/get-session` (ADR 0001 + spec: JSON must never contain the
// session token). The httpOnly cookie remains the only browser session
// credential; the JSON carries user + session metadata for the UI.
export async function GET(request: Request) {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as AuthEnv;
  const session = await resolveSession(env, request);

  if (!session) {
    return Response.json(null, {
      headers: { "cache-control": "no-store", pragma: "no-cache" },
    });
  }

  // Redact the session token — never expose it to the browser (SECURITY NOTE).
  const { token: _token, ...sessionMeta } = session.session;

  return Response.json(
    { session: sessionMeta, user: session.user },
    { headers: { "cache-control": "no-store", pragma: "no-cache" } }
  );
}
