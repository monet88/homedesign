import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  handleOutboxRequest,
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
export async function GET(request: Request) {
  let env: AuthEnv;
  try {
    const cf = await getCloudflareContext({ async: true });
    env = cf.env as unknown as AuthEnv;
  } catch {
    env = (typeof process !== "undefined" ? process.env : {}) as unknown as AuthEnv;
  }
  return handleOutboxRequest(env, request);
}
