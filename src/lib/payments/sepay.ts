// Ticket 3.2: SePay and VietQR payment fulfillment (ADR 0002 / Spec #13).
// Pure Web API / Edge runtime implementation: zero external dependencies,
// 100% Cloudflare Workers compatible, instant settlement under 3 seconds.

import type { Env } from "@/lib/bindings";
import type { CreditPack, PaymentOrderRecord } from "@/lib/payments/stripe";
import { UNIFIED_PRICING_TIERS } from "@/lib/payments/pricing-constants";

export const SEPAY_CREDIT_PACKS = {
  lite: {
    name: UNIFIED_PRICING_TIERS.lite.nameVi,
    credits: UNIFIED_PRICING_TIERS.lite.credits,
    amountVnd: UNIFIED_PRICING_TIERS.lite.vndAmount,
    currency: "vnd",
    description: UNIFIED_PRICING_TIERS.lite.descriptionVi,
  },
  plus: {
    name: UNIFIED_PRICING_TIERS.plus.nameVi,
    credits: UNIFIED_PRICING_TIERS.plus.credits,
    amountVnd: UNIFIED_PRICING_TIERS.plus.vndAmount,
    currency: "vnd",
    description: UNIFIED_PRICING_TIERS.plus.descriptionVi,
  },
  pro: {
    name: UNIFIED_PRICING_TIERS.pro.nameVi,
    credits: UNIFIED_PRICING_TIERS.pro.credits,
    amountVnd: UNIFIED_PRICING_TIERS.pro.vndAmount,
    currency: "vnd",
    description: UNIFIED_PRICING_TIERS.pro.descriptionVi,
  },
  max: {
    name: UNIFIED_PRICING_TIERS.max.nameVi,
    credits: UNIFIED_PRICING_TIERS.max.credits,
    amountVnd: UNIFIED_PRICING_TIERS.max.vndAmount,
    currency: "vnd",
    description: UNIFIED_PRICING_TIERS.max.descriptionVi,
  },
} as const;

export type SepayCreditPack = keyof typeof SEPAY_CREDIT_PACKS;

export interface CreateSepayVietQROrderParams {
  userId: string;
  pack: SepayCreditPack;
}

export interface CreateSepayVietQROrderResult {
  orderId: string;
  transferCode: string;
  pack: SepayCreditPack;
  amount: number;
  currency: string;
  credits: number;
  bankId: string;
  accountNo: string;
  accountName: string;
  qrUrl: string;
}

export interface SepayWebhookPayload {
  id: number | string;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  code?: string | null;
  content: string;
  transferType: string;
  transferAmount: number;
  accumulated?: number;
  subAccount?: string | null;
  referenceCode?: string | null;
  description?: string | null;
}

export interface SepayWebhookFulfillmentResult {
  ok: boolean;
  orderId: string;
  creditsGranted: number;
  ledgerEntryId?: string;
  alreadyProcessed?: boolean;
  ignored?: boolean;
  reason?: string;
}

/**
 * Generates an alphanumeric order ID suitable for SMS and bank transfer memo.
 * Formats: 10 uppercase characters, e.g. "8F2E4A9C1D"
 */
export function generateOrderCode(): string {
  const raw = crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return raw;
}

/**
 * Builds standard VietQR Quicklink image URL.
 * https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-<TEMPLATE>.png?amount=<AMOUNT>&addInfo=<TRANSFER_CODE>&accountName=<ACCOUNT_NAME>
 */
export function buildVietQRUrl(params: {
  bankId: string;
  accountNo: string;
  template: string;
  amountVnd: number;
  transferCode: string;
  accountName: string;
}): string {
  const base = `https://img.vietqr.io/image/${params.bankId}-${params.accountNo}-${params.template}.png`;
  const searchParams = new URLSearchParams({
    amount: String(params.amountVnd),
    addInfo: params.transferCode,
    accountName: params.accountName,
  });
  return `${base}?${searchParams.toString()}`;
}

/**
 * Creates a VietQR / SePay pending order in D1 and generates the VietQR payment link.
 */
export async function createSepayVietQROrder(
  env: Env,
  params: CreateSepayVietQROrderParams
): Promise<CreateSepayVietQROrderResult> {
  const packDef = SEPAY_CREDIT_PACKS[params.pack];
  if (!packDef) {
    const err = new Error(`INVALID_PACK: ${params.pack}`) as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const orderId = generateOrderCode();
  const transferCode = `HD${orderId}`;
  const now = Date.now();

  const bankId = env.VIETQR_BANK_ID?.trim() || "MBBank";
  const accountNo = env.VIETQR_ACCOUNT_NO?.trim() || "0000123456789";
  const accountName = env.VIETQR_ACCOUNT_NAME?.trim() || "HOMEDESIGN AI";
  const template = env.VIETQR_TEMPLATE?.trim() || "compact2";

  const qrUrl = buildVietQRUrl({
    bankId,
    accountNo,
    template,
    amountVnd: packDef.amountVnd,
    transferCode,
    accountName,
  });

  await env.DB.prepare(
    `INSERT INTO payment_orders (id, user_id, provider, pack, amount_cents, currency, credits_granted, status, provider_session_id, created_at, updated_at)
     VALUES (?1, ?2, 'sepay', ?3, ?4, 'vnd', ?5, 'pending', ?6, ?7, ?7)`
  )
    .bind(orderId, params.userId, params.pack, packDef.amountVnd, packDef.credits, transferCode, now)
    .run();

  return {
    orderId,
    transferCode,
    pack: params.pack,
    amount: packDef.amountVnd,
    currency: "vnd",
    credits: packDef.credits,
    bankId,
    accountNo,
    accountName,
    qrUrl,
  };
}

/** Constant-time string equality check to prevent timing attacks. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Validates SePay authorization token from Authorization or X-Api-Key headers.
 */
export function verifySepayWebhookToken(
  authHeader: string | null,
  expectedToken: string
): boolean {
  if (!authHeader) return false;

  let providedToken = authHeader.trim();
  if (providedToken.startsWith("Apikey ")) {
    providedToken = providedToken.slice(7).trim();
  } else if (providedToken.startsWith("Bearer ")) {
    providedToken = providedToken.slice(7).trim();
  }

  return timingSafeEqual(providedToken, expectedToken.trim());
}

/**
 * Extracts order code formatted as `HD<order_id>` from bank transfer memo/content.
 * Tolerates surrounding punctuation, whitespace, and lowercase input.
 */
export function extractOrderCode(
  content: string,
  code?: string | null
): { orderId: string; transferCode: string } | null {
  // Check code field first if provided by SePay
  if (code && typeof code === "string") {
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.startsWith("HD") && cleanCode.length > 2) {
      return {
        orderId: cleanCode.slice(2),
        transferCode: cleanCode,
      };
    }
  }

  if (!content || typeof content !== "string") return null;

  // Search for HD followed by alphanumeric characters in transfer content
  const match = /(?:^|[^A-Z0-9])HD([A-Z0-9]+)/i.exec(content);
  if (!match || !match[1]) return null;

  const rawOrderId = match[1].toUpperCase();
  return {
    orderId: rawOrderId,
    transferCode: `HD${rawOrderId}`,
  };
}

/**
 * Handles incoming SePay webhook notifications, settling credits atomically.
 */
export async function handleSepayWebhook(
  env: Env,
  payload: SepayWebhookPayload
): Promise<SepayWebhookFulfillmentResult> {
  // 1. Check transfer type: must be incoming funds
  const transferType = String(payload.transferType || "").toLowerCase();
  if (transferType !== "in") {
    return {
      ok: true,
      orderId: "",
      creditsGranted: 0,
      ignored: true,
      reason: `Ignored transferType: ${payload.transferType}`,
    };
  }

  // 2. Extract transfer syntax `HD<order_id>`
  const extracted = extractOrderCode(payload.content, payload.code);
  if (!extracted) {
    const err = new Error(
      `ORDER_CODE_NOT_FOUND: No valid HD<order_id> found in transfer content: "${payload.content}"`
    ) as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const { orderId, transferCode } = extracted;

  // 3. Query payment_orders in D1 by orderId or transferCode
  const order = await env.DB.prepare(
    `SELECT * FROM payment_orders WHERE (id = ?1 OR provider_session_id = ?2) AND provider = 'sepay'`
  )
    .bind(orderId, transferCode)
    .first<PaymentOrderRecord>();

  if (!order) {
    const err = new Error(
      `ORDER_NOT_FOUND: No SePay order matches ${orderId} (${transferCode})`
    ) as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  // 4. Verify transfer amount matches or exceeds order amount
  const transferAmount = Number(payload.transferAmount);
  if (isNaN(transferAmount) || transferAmount < order.amount_cents) {
    const err = new Error(
      `AMOUNT_MISMATCH: Received ${transferAmount} VND, expected ${order.amount_cents} VND for order ${order.id}`
    ) as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  // 5. Idempotency check: if order is already completed, return immediately without double crediting
  if (order.status === "completed") {
    return {
      ok: true,
      orderId: order.id,
      creditsGranted: order.credits_granted,
      ledgerEntryId: order.ledger_entry_id ?? undefined,
      alreadyProcessed: true,
    };
  }

  // 6. Atomic batch settlement in D1
  const ledgerId = crypto.randomUUID();
  const sepayTxId = String(payload.id);
  const now = Date.now();
  const packName = SEPAY_CREDIT_PACKS[order.pack as SepayCreditPack]?.name ?? order.pack;

  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
       SELECT ?1, ?2, 'payment', ?3, ?4, 'sepay', ?5, ?6, ?7
       WHERE EXISTS (SELECT 1 FROM payment_orders WHERE id = ?8 AND status = 'pending')`
    ).bind(
      ledgerId,
      order.user_id,
      order.credits_granted,
      `SePay VietQR purchase (${packName})`,
      sepayTxId,
      `sepay-order-${order.id}`,
      now,
      order.id
    ),
    env.DB.prepare(
      `UPDATE payment_orders
       SET status = 'completed', provider_payment_id = ?1, ledger_entry_id = ?2, updated_at = ?3
       WHERE id = ?4 AND status = 'pending'`
    ).bind(sepayTxId, ledgerId, now, order.id),
  ]);

  const updatedCount = results[1]?.meta?.changes ?? 0;
  if (updatedCount === 0) {
    // Order was already settled concurrently by a sibling delivery
    return {
      ok: true,
      orderId: order.id,
      creditsGranted: order.credits_granted,
      alreadyProcessed: true,
    };
  }

  // 7. Activate viral referral reward for referrer upon referee's payment activation
  try {
    const { activateReferralReward } = await import("@/lib/referral/referral");
    await activateReferralReward(env.DB, order.user_id);
  } catch (err) {
    console.warn("[REFERRAL] SePay payment activation warning:", err);
  }

  return {
    ok: true,
    orderId: order.id,
    creditsGranted: order.credits_granted,
    ledgerEntryId: ledgerId,
  };
}

/**
 * Query current status of a SePay order for frontend polling.
 */
export async function getSepayOrderStatus(
  env: Env,
  orderId: string,
  userId: string
): Promise<{
  id: string;
  status: string;
  pack: string;
  amount: number;
  credits: number;
  completed: boolean;
  providerPaymentId: string | null;
  updatedAt: number;
} | null> {
  const order = await env.DB.prepare(
    `SELECT * FROM payment_orders WHERE id = ?1 AND user_id = ?2`
  )
    .bind(orderId, userId)
    .first<PaymentOrderRecord>();

  if (!order) return null;

  return {
    id: order.id,
    status: order.status,
    pack: order.pack,
    amount: order.amount_cents,
    credits: order.credits_granted,
    completed: order.status === "completed",
    providerPaymentId: order.provider_payment_id,
    updatedAt: order.updated_at,
  };
}
