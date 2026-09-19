import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/bindings";
import {
  handleSepayWebhook,
  verifySepayWebhookToken,
} from "@/lib/payments/sepay";
import { SepayWebhookSchema } from "@/lib/validation/schemas";

// `POST /api/payments/sepay-webhook` (Ticket 3.2): Process SePay webhook notifications.
//
// Verifies authorization token via `Authorization` (Apikey/Bearer) or `X-Api-Key` headers.
// Atomically settles credits in `credit_ledger` and completes the order in < 3s.

export async function POST(request: Request) {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as Env;

  const expectedToken = (env.SEPAY_WEBHOOK_TOKEN || env.SEPAY_API_KEY)?.trim();
  if (!expectedToken) {
    return Response.json(
      { error: "SEPAY_WEBHOOK_TOKEN_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const authHeader =
    request.headers.get("authorization") || request.headers.get("x-api-key");

  if (!authHeader || !verifySepayWebhookToken(authHeader, expectedToken)) {
    return Response.json({ error: "UNAUTHORIZED_SEPAY_TOKEN" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = SepayWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_INPUT", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const fulfillment = await handleSepayWebhook(env, parsed.data);
    return Response.json({ success: true, ...fulfillment });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const message = (err as Error).message;
    return Response.json({ error: message }, { status });
  }
}
