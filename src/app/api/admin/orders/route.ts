import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdminSession } from "@/lib/auth/admin";
import type { Env } from "@/lib/bindings";
import type { AuthEnv } from "@/lib/auth/server";

// Ticket 7.4: Admin Orders & Realtime Revenue Analytics
// GET /api/admin/orders — Protected endpoint for role: admin

export async function GET(request: Request) {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as Env;

  const auth = await requireAdminSession(request, env as unknown as AuthEnv);
  if (!auth.authorized) {
    return Response.json(
      { error: auth.error },
      { status: auth.status, headers: { "cache-control": "no-store" } }
    );
  }

  try {
    // 1. Fetch recent payment orders
    const ordersRes = await env.DB.prepare(
      `SELECT po.*, u.email as user_email, u.name as user_name
       FROM payment_orders po
       LEFT JOIN user u ON po.user_id = u.id
       ORDER BY po.created_at DESC
       LIMIT 50`
    ).all();

    const orders = ordersRes.results || [];

    // 2. Aggregate metrics
    const statsRes = await env.DB.prepare(
      `SELECT
         COUNT(*) as total_orders,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
         SUM(CASE WHEN status = 'completed' THEN amount_cents ELSE 0 END) as total_revenue_cents,
         SUM(CASE WHEN status = 'completed' AND provider = 'stripe' THEN amount_cents ELSE 0 END) as stripe_revenue_cents,
         SUM(CASE WHEN status = 'completed' AND provider = 'sepay' THEN amount_cents ELSE 0 END) as sepay_revenue_cents,
         SUM(CASE WHEN status = 'completed' THEN credits_granted ELSE 0 END) as total_credits_granted
       FROM payment_orders`
    ).first<any>();

    return Response.json(
      {
        code: 0,
        data: {
          orders,
          metrics: {
            totalOrders: statsRes?.total_orders || 0,
            completedOrders: statsRes?.completed_orders || 0,
            pendingOrders: statsRes?.pending_orders || 0,
            totalRevenueCents: statsRes?.total_revenue_cents || 0,
            stripeRevenueCents: statsRes?.stripe_revenue_cents || 0,
            sepayRevenueCents: statsRes?.sepay_revenue_cents || 0,
            totalCreditsGranted: statsRes?.total_credits_granted || 0,
          },
        },
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    console.error("Admin orders query error:", err);
    return Response.json(
      { error: "INTERNAL_ERROR", message: "Failed to query orders." },
      { status: 500 }
    );
  }
}
