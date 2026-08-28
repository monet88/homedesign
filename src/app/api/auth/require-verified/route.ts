import { authorizeVerified } from "@/lib/ai/http";

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
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  return Response.json(
    { user: { id: auth.userId, emailVerified: true } },
    { headers: { "cache-control": "no-store" } }
  );
}
