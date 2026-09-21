import { authorizeVerified } from "@/lib/ai/http";
import { createStripeCheckoutSession } from "@/lib/payments/stripe";
import { StripeCheckoutSchema } from "@/lib/validation/schemas";

// `POST /api/payments/stripe/checkout` (Ticket 3.1): Create a Stripe Checkout Session.
//
// Requires: verified user session.
// Body: { pack: "lite"|"plus"|"pro"|"max", successUrl?: string, cancelUrl?: string }
// Returns: 200 { code: 0, data: { orderId, sessionId, checkoutUrl } }

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;
  const env = auth.env;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = StripeCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_INPUT", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { pack, successUrl, cancelUrl } = parsed.data;
  const origin = env.BETTER_AUTH_URL || "http://localhost:3000";

  // Validate return URLs to prevent Open Redirect attacks
  const isValidReturnUrl = (urlStr?: string): boolean => {
    if (!urlStr) return true;
    try {
      if (urlStr.startsWith("/") && !urlStr.startsWith("//")) return true;
      const parsedUrl = new URL(urlStr);
      const expectedOrigin = new URL(origin).origin;
      return parsedUrl.origin === expectedOrigin;
    } catch {
      return false;
    }
  };

  if (!isValidReturnUrl(successUrl) || !isValidReturnUrl(cancelUrl)) {
    return Response.json(
      {
        error: "INVALID_RETURN_URL",
        message: "Return URLs (successUrl/cancelUrl) must match application origin",
      },
      { status: 400 }
    );
  }

  const resolveFullUrl = (urlStr: string | undefined, defaultPath: string): string => {
    if (!urlStr) return `${origin}${defaultPath}`;
    if (urlStr.startsWith("/")) return `${origin}${urlStr}`;
    return urlStr;
  };

  try {
    const result = await createStripeCheckoutSession(env, {
      userId: auth.userId,
      userEmail: auth.userEmail || "customer@homedesign.ai",
      pack,
      successUrl: resolveFullUrl(
        successUrl,
        "/activity?payment=success&session_id={CHECKOUT_SESSION_ID}"
      ),
      cancelUrl: resolveFullUrl(cancelUrl, "/pricing?payment=cancelled"),
    });

    return Response.json(
      { code: 0, data: result },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const message = (err as Error).message;
    return Response.json({ error: message }, { status });
  }
}
