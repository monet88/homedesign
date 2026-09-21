import { authorizeVerified } from "@/lib/ai/http";
import { getSepayOrderStatus } from "@/lib/payments/sepay";

// `GET /api/payments/sepay/order?orderId=...` (Ticket 3.2): Query order status for polling.
//
// Requires: verified user session.
// Returns: 200 { code: 0, data: { id, status, completed, credits, amount, ... } }

export async function GET(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;
  const env = auth.env;

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId")?.trim();

  if (!orderId) {
    return Response.json({ error: "MISSING_ORDER_ID" }, { status: 400 });
  }

  const order = await getSepayOrderStatus(env, orderId, auth.userId);
  if (!order) {
    return Response.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
  }

  return Response.json(
    { code: 0, data: order },
    { headers: { "cache-control": "no-store" } }
  );
}
