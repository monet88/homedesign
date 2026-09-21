import { authorizeVerified } from "@/lib/ai/http";
import { createSepayVietQROrder } from "@/lib/payments/sepay";
import { SepayCheckoutSchema } from "@/lib/validation/schemas";

// `POST /api/payments/sepay/checkout` (Ticket 3.2): Create a SePay / VietQR pending order.
//
// Requires: verified user session.
// Body: { pack: "lite"|"plus"|"pro"|"max" }
// Returns: 200 { code: 0, data: { orderId, transferCode, qrUrl, amount, currency, credits, ... } }

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

  const parsed = SepayCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_INPUT", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { pack } = parsed.data;

  try {
    const result = await createSepayVietQROrder(env, {
      userId: auth.userId,
      pack,
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
