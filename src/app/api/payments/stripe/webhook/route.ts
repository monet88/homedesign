import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/bindings";
import {
  handleStripeWebhook,
  verifyStripeWebhookSignature,
} from "@/lib/payments/stripe";

// `POST /api/payments/stripe/webhook` (Ticket 3.1): Process Stripe webhook events.
//
// Verifies HMAC-SHA256 signature from `stripe-signature` header using `STRIPE_WEBHOOK_SECRET`.
// Atomically fulfills orders upon receiving `checkout.session.completed`.

export async function POST(request: Request) {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as Env;

  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return Response.json(
      { error: "STRIPE_WEBHOOK_SECRET_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const signatureHeader = request.headers.get("stripe-signature");
  if (!signatureHeader) {
    return Response.json(
      { error: "MISSING_STRIPE_SIGNATURE_HEADER" },
      { status: 400 }
    );
  }

  const rawBody = await request.text();
  let event: any;
  try {
    event = await verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret);
  } catch (err) {
    const message = (err as Error).message;
    return Response.json({ error: message }, { status: 400 });
  }

  try {
    const fulfillment = await handleStripeWebhook(env, event);
    return Response.json({ received: true, ...fulfillment });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const message = (err as Error).message;
    return Response.json({ error: message }, { status });
  }
}
