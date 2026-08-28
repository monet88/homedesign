// Ticket #40: Shared Zod validation schemas.
//
// Establishes the parse-or-400 pattern reused by tickets #44–#47.
// All mutation endpoints parse the request body with a Zod schema and return
// a 400 with structured field errors on failure.
//
// Usage:
//   const parsed = AdminCreditAdjustmentSchema.safeParse(body);
//   if (!parsed.success) {
//     return Response.json(
//       { error: 'INVALID_INPUT', details: parsed.error.flatten().fieldErrors },
//       { status: 400 }
//     );
//   }

import { z } from "zod";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Reusable refinement: value must be a safe integer (no fractions, no NaN/Infinity). */
const strictInt = z
  .number({ message: "Must be a number" })
  .refine((v) => Number.isFinite(v), { message: "Must be finite" })
  .refine((v) => Number.isInteger(v), { message: "Must be an integer" })
  .refine((v) => Math.abs(v) <= 2_147_483_647, {
    message: "Out of range (max ±2 147 483 647)",
  });

// ── Admin Credit Adjustment ────────────────────────────────────────────────

/**
 * Schema for POST /api/admin/credits.
 *
 * - `userId`  — non-empty trimmed string
 * - `amount`  — strict integer, non-zero, finite, within ±2^31-1
 * - `reason`  — optional trimmed string (defaults are applied in the route)
 *
 * Unknown fields are silently stripped (Zod default `.strip()` mode).
 */
export const AdminCreditAdjustmentSchema = z
  .object({
    userId: z
      .string({ message: "userId is required" })
      .trim()
      .min(1, { message: "userId must not be empty" }),
    amount: strictInt.refine((v) => v !== 0, {
      message: "amount must not be zero",
    }),
    reason: z.string().trim().optional(),
  })
  .strip();

export type AdminCreditAdjustmentInput = z.infer<
  typeof AdminCreditAdjustmentSchema
>;
