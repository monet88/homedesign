import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  listOutbox,
  authorizeOutboxRequest,
  type AuthEnv,
} from "@/lib/auth/server";

/**
 * Environment-local test-outbox (Ticket #32 / ADR 0001).
 * Reads verification messages that the EmailDelivery adapter wrote to D1.
 *
 * Security properties:
 * 1. Production returns 404 (no outbox existence disclosure).
 * 2. Development/Preview/Staging requires an authenticated admin principal
 *    or explicit capability secret.
 * 3. Local tooling can access messages using local capability credentials.
 * 4. Every environment only retrieves messages from its own environment namespace.
 *    Cross-environment access attempts are denied with 403.
 * 5. Responses are non-cacheable (Cache-Control: no-store) and nothing sensitive
 *    is logged to application logs.
 */
export async function GET(request: Request, passedEnv?: AuthEnv) {
  let env: AuthEnv;
  if (passedEnv && typeof (passedEnv as AuthEnv).DB !== "undefined") {
    env = passedEnv;
  } else {
    try {
      const cf = await getCloudflareContext({ async: true });
      env = cf.env as unknown as AuthEnv;
    } catch {
      env = (typeof process !== "undefined" ? process.env : {}) as unknown as AuthEnv;
    }
  }

  // Production responds as if outbox does not exist (404 semantics)
  if (env.ENVIRONMENT === "production") {
    return Response.json(
      { error: "not found" },
      { status: 404, headers: { "cache-control": "no-store" } }
    );
  }

  const currentEnv = env.ENVIRONMENT || "development";
  const url = new URL(request.url);
  const requestedEnv =
    url.searchParams.get("environment") ?? request.headers.get("x-environment");

  // Reject cross-environment reads
  if (requestedEnv && requestedEnv.toLowerCase() !== currentEnv.toLowerCase()) {
    return Response.json(
      { error: "CROSS_ENVIRONMENT_FORBIDDEN" },
      { status: 403, headers: { "cache-control": "no-store" } }
    );
  }

  const auth = await authorizeOutboxRequest(env, request);
  if (!auth.authorized) {
    return Response.json(
      { error: auth.error },
      { status: auth.status, headers: { "cache-control": "no-store" } }
    );
  }

  const email = url.searchParams.get("email") ?? undefined;
  const result = await listOutbox(env, email, currentEnv);

  return Response.json(
    { messages: result.results },
    { headers: { "cache-control": "no-store" } }
  );
}
