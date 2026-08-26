import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createAuth, requireVerifiedUser, type AuthEnv } from "@/lib/auth/server";

// Contract endpoint for ticket #7 (Generate): proves the unverified gate.
//
// `requireVerifiedUser` is the shared server-side check that billable endpoints
// (Generate, asset finalize, etc.) call before creating any task or hold. This
// route exposes it over HTTP so the 403 EMAIL_NOT_VERIFIED shape is testable
// end-to-end without waiting for ticket #7. Later tickets call
// `requireVerifiedUser(session)` directly inside their route handlers instead
// of round-tripping through here; this endpoint remains the contract proof.
//
// Response (unverified): 403 { "error": "EMAIL_NOT_VERIFIED" }
// Response (verified):    200 { "user": { id, email, emailVerified } }
export async function POST(request: Request) {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as AuthEnv;
  const auth = createAuth(env);

  const session = await auth.api.getSession({ headers: request.headers });

  try {
    requireVerifiedUser(session);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 403;
    return Response.json({ error: "EMAIL_NOT_VERIFIED" }, { status });
  }

  const verified = session as NonNullable<typeof session>;
  return Response.json(
    { user: { id: verified.user.id, email: verified.user.email, emailVerified: verified.user.emailVerified } },
    { headers: { "cache-control": "no-store" } }
  );
}
