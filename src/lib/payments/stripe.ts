// Ticket 3.1: Stripe Checkout and Webhook fulfillment (ADR 0002 / Spec #13).
// Pure Web API / Edge runtime implementation: zero external dependencies,
// 100% Cloudflare Workers compatible, verifiable with Web Crypto HMAC-SHA256.

import type { Env } from "@/lib/bindings";
import { UNIFIED_PRICING_TIERS } from "@/lib/payments/pricing-constants";

export const CREDIT_PACKS = {
  lite: {
    name: UNIFIED_PRICING_TIERS.lite.name,
    credits: UNIFIED_PRICING_TIERS.lite.credits,
    amountCents: UNIFIED_PRICING_TIERS.lite.usdAmountCents,
    currency: "usd",
    description: UNIFIED_PRICING_TIERS.lite.description,
  },
  plus: {
    name: UNIFIED_PRICING_TIERS.plus.name,
    credits: UNIFIED_PRICING_TIERS.plus.credits,
    amountCents: UNIFIED_PRICING_TIERS.plus.usdAmountCents,
    currency: "usd",
    description: UNIFIED_PRICING_TIERS.plus.description,
  },
  pro: {
    name: UNIFIED_PRICING_TIERS.pro.name,
    credits: UNIFIED_PRICING_TIERS.pro.credits,
    amountCents: UNIFIED_PRICING_TIERS.pro.usdAmountCents,
    currency: "usd",
    description: UNIFIED_PRICING_TIERS.pro.description,
  },
  max: {
    name: UNIFIED_PRICING_TIERS.max.name,
    credits: UNIFIED_PRICING_TIERS.max.credits,
    amountCents: UNIFIED_PRICING_TIERS.max.usdAmountCents,
    currency: "usd",
    description: UNIFIED_PRICING_TIERS.max.description,
  },
} as const;

export type CreditPack = keyof typeof CREDIT_PACKS;

export interface PaymentOrderRecord {
  id: string;
  user_id: string;
  provider: "stripe" | "sepay";
  pack: CreditPack;
  amount_cents: number;
  currency: string;
  credits_granted: number;
  status: "pending" | "completed" | "failed" | "refunded";
  provider_session_id: string | null;
  provider_payment_id: string | null;
  ledger_entry_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateCheckoutSessionParams {
  userId: string;
  userEmail: string;
  pack: CreditPack;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutSessionResult {
  orderId: string;
  sessionId: string;
  checkoutUrl: string;
}

/**
 * Creates a Stripe Checkout Session via Stripe REST API.
 * Idempotently records a `pending` payment order in D1.
 */
export async function createStripeCheckoutSession(
  env: Env,
  params: CreateCheckoutSessionParams
): Promise<CreateCheckoutSessionResult> {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    const err = new Error("STRIPE_NOT_CONFIGURED: STRIPE_SECRET_KEY is missing") as Error & { status?: number };
    err.status = 503;
    throw err;
  }

  const packDef = CREDIT_PACKS[params.pack];
  if (!packDef) {
    const err = new Error(`INVALID_PACK: ${params.pack}`) as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const orderId = crypto.randomUUID();
  const now = Date.now();

  const formData = new URLSearchParams();
  formData.append("mode", "payment");
  formData.append("client_reference_id", params.userId);
  formData.append("customer_email", params.userEmail);
  formData.append("line_items[0][price_data][currency]", packDef.currency);
  formData.append("line_items[0][price_data][unit_amount]", String(packDef.amountCents));
  formData.append("line_items[0][price_data][product_data][name]", packDef.name);
  formData.append("line_items[0][price_data][product_data][description]", packDef.description);
  formData.append("line_items[0][quantity]", "1");
  formData.append("metadata[order_id]", orderId);
  formData.append("metadata[user_id]", params.userId);
  formData.append("metadata[pack]", params.pack);
  formData.append("metadata[credits]", String(packDef.credits));
  formData.append("success_url", params.successUrl);
  formData.append("cancel_url", params.cancelUrl);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  const body = (await res.json()) as { id?: string; url?: string; error?: { message: string } };

  if (!res.ok || !body.id || !body.url) {
    const message = body.error?.message || `Stripe API error: HTTP ${res.status}`;
    const err = new Error(message) as Error & { status?: number };
    err.status = 502;
    throw err;
  }

  await env.DB.prepare(
    `INSERT INTO payment_orders (id, user_id, provider, pack, amount_cents, currency, credits_granted, status, provider_session_id, created_at, updated_at)
     VALUES (?1, ?2, 'stripe', ?3, ?4, ?5, ?6, 'pending', ?7, ?8, ?8)`
  )
    .bind(orderId, params.userId, params.pack, packDef.amountCents, packDef.currency, packDef.credits, body.id, now)
    .run();

  return {
    orderId,
    sessionId: body.id,
    checkoutUrl: body.url,
  };
}

/** Constant-time string equality check to prevent timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Verify Stripe webhook signature using standard Web Crypto HMAC-SHA256.
 * Header format: `t=1492774577,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd`
 */
export async function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300
): Promise<any> {
  const parts = signatureHeader.split(",");
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.trim().split("=");
    if (key === "t") {
      timestamp = parseInt(value, 10);
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    throw new Error("MALFORMED_STRIPE_SIGNATURE_HEADER");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (toleranceSeconds > 0 && Math.abs(nowSec - timestamp) > toleranceSeconds) {
    throw new Error("STRIPE_SIGNATURE_EXPIRED");
  }

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(signedPayload));
  const expectedSig = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const valid = signatures.some((sig) => timingSafeEqual(sig, expectedSig));
  if (!valid) {
    throw new Error("INVALID_STRIPE_SIGNATURE");
  }

  return JSON.parse(payload);
}

export interface WebhookFulfillmentResult {
  ok: boolean;
  orderId: string;
  creditsGranted: number;
  ledgerEntryId?: string;
  alreadyProcessed?: boolean;
}

/**
 * Handles completed Stripe checkout events, atomically settling credits in credit_ledger.
 */
export async function handleStripeWebhook(
  env: Env,
  event: { type: string; data: { object: { id: string; payment_intent?: string } } }
): Promise<WebhookFulfillmentResult> {
  if (event.type !== "checkout.session.completed") {
    return { ok: false, orderId: "", creditsGranted: 0 };
  }

  const session = event.data.object;
  const sessionId = session.id;

  const order = await env.DB.prepare(
    `SELECT * FROM payment_orders WHERE provider_session_id = ?1`
  )
    .bind(sessionId)
    .first<PaymentOrderRecord>();

  if (!order) {
    const err = new Error(`ORDER_NOT_FOUND: No order for session ${sessionId}`) as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  // Idempotency check: if already completed, do not credit twice
  if (order.status === "completed") {
    return {
      ok: true,
      orderId: order.id,
      creditsGranted: order.credits_granted,
      ledgerEntryId: order.ledger_entry_id ?? undefined,
      alreadyProcessed: true,
    };
  }

  const ledgerId = crypto.randomUUID();
  const paymentIntentId = session.payment_intent || sessionId;
  const now = Date.now();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
       VALUES (?1, ?2, 'payment', ?3, ?4, 'stripe', ?5, ?6, ?7)`
    ).bind(
      ledgerId,
      order.user_id,
      order.credits_granted,
      `Stripe purchase (${CREDIT_PACKS[order.pack]?.name ?? order.pack})`,
      paymentIntentId,
      `stripe-${sessionId}`,
      now
    ),
    env.DB.prepare(
      `UPDATE payment_orders
       SET status = 'completed', provider_payment_id = ?1, ledger_entry_id = ?2, updated_at = ?3
       WHERE id = ?4`
    ).bind(paymentIntentId, ledgerId, now, order.id),
  ]);

  // Activate viral referral reward for referrer upon referee's payment activation
  try {
    const { activateReferralReward } = await import("@/lib/referral/referral");
    await activateReferralReward(env.DB, order.user_id);
  } catch (err) {
    console.warn("[REFERRAL] Stripe payment activation warning:", err);
  }

  return {
    ok: true,
    orderId: order.id,
    creditsGranted: order.credits_granted,
    ledgerEntryId: ledgerId,
  };
}
