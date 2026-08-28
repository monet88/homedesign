import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleAuthRequest, type AuthEnv } from "@/lib/auth/server";

// BetterAuth catch-all route handler. Serves every `/api/auth/*` endpoint
// (sign-in/email, sign-up/email, sign-out, send-verification-email, verify-email,
// one-tap/callback, etc.). `GET /api/auth/get-session` is handled by its own
// route so the session token can be redacted from the browser-visible JSON.
export async function handler(request: Request) {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as AuthEnv;
  return handleAuthRequest(env, request);
}

export { handler as GET, handler as POST, handler as DELETE, handler as PUT, handler as PATCH };
