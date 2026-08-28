import { requireAdminSession } from "@/lib/auth/server";
import {
  getAvailableCredits,
  recordAdminCreditAdjustment,
} from "@/lib/credits/ledger";
import { AdminCreditAdjustmentSchema } from "@/lib/validation/schemas";
import type { Env } from "@/lib/bindings";

export async function POST(request: Request) {
  const auth = await requireAdminSession(request);
  if (!auth.authorized) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  // ── Zod parse-or-400 (ticket #40 pattern) ──────────────────────────────
  const parsed = AdminCreditAdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_INPUT", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { userId, amount, reason: rawReason } = parsed.data;
  const reason =
    rawReason || (amount >= 0 ? "Admin credit grant" : "Admin credit deduction");

  try {
    const user = await auth.env.DB.prepare("SELECT id FROM user WHERE id = ?1")
      .bind(userId)
      .first<{ id: string }>();

    if (!user) {
      return Response.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    // ── Overdraft protection (ticket #40) ──────────────────────────────
    // For deductions (negative amount), check that the user has enough
    // available credits BEFORE recording. This prevents ledger pollution
    // and maintains the invariant atomically with D1's single-writer.
    if (amount < 0) {
      const available = await getAvailableCredits(
        auth.env as unknown as Env,
        userId
      );
      if (Math.abs(amount) > available) {
        return Response.json(
          {
            error: "INSUFFICIENT_CREDITS",
            available,
            requested: Math.abs(amount),
          },
          { status: 409 }
        );
      }
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
