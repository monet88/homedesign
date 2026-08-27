import { requireAdminSession } from "@/lib/auth/server";
import {
  getAvailableCredits,
  recordAdminCreditAdjustment,
} from "@/lib/credits/ledger";
import type { Env } from "@/lib/bindings";

export async function POST(request: Request) {
  const auth = await requireAdminSession(request);
  if (!auth.authorized) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const rawAmount = body.amount;
  const amount = typeof rawAmount === "number" ? rawAmount : parseInt(String(rawAmount), 10);
  const rawReason = typeof body.reason === "string" ? body.reason.trim() : "";
  const reason = rawReason || (amount >= 0 ? "Admin credit grant" : "Admin credit deduction");

  if (!userId) {
    return Response.json({ error: "INVALID_USER_ID" }, { status: 400 });
  }

  if (isNaN(amount) || amount === 0) {
    return Response.json({ error: "INVALID_AMOUNT" }, { status: 400 });
  }

  try {
    const user = await auth.env.DB.prepare("SELECT id FROM user WHERE id = ?1")
      .bind(userId)
      .first<{ id: string }>();

    if (!user) {
      return Response.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    await recordAdminCreditAdjustment(
      auth.env as unknown as Env,
      userId,
      amount,
      reason,
      auth.user.id
    );

    const updatedBalance = await getAvailableCredits(auth.env as unknown as Env, userId);

    return Response.json({
      code: 0,
      data: {
        userId,
        creditBalance: updatedBalance,
        balance: updatedBalance,
        amount,
        reason,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DATABASE_ERROR";
    return Response.json({ error: message }, { status: 500 });
  }
}
