import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listOutbox, type AuthEnv } from "@/lib/auth/server";

// Environment-local test-outbox (ADR 0001). Reads verification messages that
// the EmailDelivery adapter wrote to D1. Only reachable in non-production
// environments; production returns 404 (no outbox). Access is protected by
// local tooling / Cloudflare Access in deployed previews — the endpoint itself
// never exposes the outbox to anonymous traffic in a deployed environment.
export async function GET(request: Request) {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as AuthEnv;

  if (env.ENVIRONMENT === "production") {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const email = url.searchParams.get("email") ?? undefined;
  const result = await listOutbox(env, email);

  return Response.json({ messages: result.results }, { headers: { "cache-control": "no-store" } });
}
