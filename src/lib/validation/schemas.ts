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

// ── Asset & Project Mutation Schemas (Ticket #45) ───────────────────────────

/**
 * Schema for POST /api/assets/upload-intent.
 *
 * - `name`: non-empty trimmed string (max 255 chars)
 * - `mimeType`: 'image/png' | 'image/jpeg'
 * - `size`: positive integer <= 50MB (52,428,800 bytes)
 *
 * Unknown fields are rejected with .strict().
 */
export const UploadIntentSchema = z
  .object({
    name: z
      .string({ message: "name is required" })
      .trim()
      .min(1, { message: "name must not be empty" })
      .max(255, { message: "name must not exceed 255 characters" }),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"], {
      message: "mimeType must be 'image/png', 'image/jpeg', or 'image/webp'",
    }),
    size: z
      .number({ message: "size is required and must be a number" })
      .int({ message: "size must be an integer" })
      .min(1, { message: "size must be at least 1 byte" })
      .max(50 * 1024 * 1024, {
        message: "size must not exceed 50MB (52428800 bytes)",
      }),
  })
  .strict();

export type UploadIntentInput = z.infer<typeof UploadIntentSchema>;

/**
 * Schema for POST /api/assets/finalize.
 *
 * - `assetId`: non-empty trimmed string
 *
 * Unknown fields are rejected with .strict().
 */
export const FinalizeAssetSchema = z
  .object({
    assetId: z
      .string({ message: "assetId is required" })
      .trim()
      .min(1, { message: "assetId must not be empty" })
      .max(128, { message: "assetId is too long" }),
  })
  .strict();

export type FinalizeAssetInput = z.infer<typeof FinalizeAssetSchema>;

/**
 * Schema for PATCH /api/projects/[id]/favorite.
 *
 * - `favorite`: boolean
 *
 * Unknown fields are rejected with .strict().
 */
export const ProjectFavoriteSchema = z
  .object({
    favorite: z.boolean({ message: "favorite must be a boolean" }),
  })
  .strict();

export type ProjectFavoriteInput = z.infer<typeof ProjectFavoriteSchema>;

// ── Floor Plan Stage Commands (Ticket #47) ──────────────────────────────────

/**
 * Schema for POST /api/floor-plan/room-designs/[id]/recognize.
 *
 * Free recognition + brief proposal.
 * Accepts optional style, stylePreference, freeformRequirements.
 * Unknown fields are rejected with .strict().
 */
export const FloorPlanRecognizeSchema = z
  .object({
    style: z.string().trim().optional(),
    stylePreference: z.string().trim().optional(),
    freeformRequirements: z.string().trim().optional(),
  })
  .strict();

export type FloorPlanRecognizeInput = z.infer<typeof FloorPlanRecognizeSchema>;

/**
 * Schema for POST /api/floor-plan/room-designs/[id]/confirm-brief.
 *
 * Confirms room brief, locks marker, and gates layout stage.
 * Takes no payload (empty object).
 * Unknown fields are rejected with .strict().
 */
export const FloorPlanConfirmBriefSchema = z
  .object({})
  .strict();

export type FloorPlanConfirmBriefInput = z.infer<
  typeof FloorPlanConfirmBriefSchema
>;

/**
 * Schema for POST /api/floor-plan/room-designs/[id]/confirm-layout.
 *
 * Confirms room layout stage run.
 * Accepts optional designId.
 * Unknown fields are rejected with .strict().
 */
export const FloorPlanConfirmLayoutSchema = z
  .object({
    designId: z
      .string({ message: "designId must be a string" })
      .trim()
      .min(1, { message: "designId must not be empty" })
      .optional(),
  })
  .strict();

export type FloorPlanConfirmLayoutInput = z.infer<
  typeof FloorPlanConfirmLayoutSchema
>;

/**
 * Schema for POST /api/floor-plan/room-designs/[id]/confirm-render.
 *
 * Confirms room render stage run.
 * Accepts optional designId.
 * Unknown fields are rejected with .strict().
 */
export const FloorPlanConfirmRenderSchema = z
  .object({
    designId: z
      .string({ message: "designId must be a string" })
      .trim()
      .min(1, { message: "designId must not be empty" })
      .optional(),
  })
  .strict();

export type FloorPlanConfirmRenderInput = z.infer<
  typeof FloorPlanConfirmRenderSchema
>;


// ── Mock Payment (Ticket #46) ──────────────────────────────────────────────

/**
 * Schema for POST /api/payments/mock.
 *
 * - `pack`            — enum: 'lite' | 'plus' | 'pro' | 'max'
 * - `idempotencyKey`  — non-empty trimmed string
 *
 * Unknown fields are silently stripped (Zod default `.strip()` mode).
 */
export const MockPaymentSchema = z
  .object({
    pack: z.enum(["lite", "plus", "pro", "max"], {
      message: "pack must be one of: lite, plus, pro, max",
    }),
    idempotencyKey: z
      .string({ message: "idempotencyKey is required" })
      .trim()
      .min(1, { message: "idempotencyKey must not be empty" }),
  })
  .strip();

export type MockPaymentInput = z.infer<typeof MockPaymentSchema>;

/**
 * Schema for POST /api/payments/stripe/checkout (Ticket 3.1).
 *
 * - `pack`: 'lite' | 'plus' | 'pro' | 'max'
 * - `successUrl`: optional valid URL string
 * - `cancelUrl`: optional valid URL string
 */
export const StripeCheckoutSchema = z
  .object({
    pack: z.enum(["lite", "plus", "pro", "max"], {
      message: "pack must be one of: lite, plus, pro, max",
    }),
    successUrl: z.string().url({ message: "successUrl must be a valid URL" }).optional(),
    cancelUrl: z.string().url({ message: "cancelUrl must be a valid URL" }).optional(),
  })
  .strict();

export type StripeCheckoutInput = z.infer<typeof StripeCheckoutSchema>;

/**
 * Schema for POST /api/payments/sepay/checkout (Ticket 3.2).
 *
 * - `pack`: 'lite' | 'plus' | 'pro' | 'max'
 */
export const SepayCheckoutSchema = z
  .object({
    pack: z.enum(["lite", "plus", "pro", "max"], {
      message: "pack must be one of: lite, plus, pro, max",
    }),
  })
  .strict();

export type SepayCheckoutInput = z.infer<typeof SepayCheckoutSchema>;

/**
 * Schema for POST /api/payments/sepay-webhook (Ticket 3.2).
 */
export const SepayWebhookSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    gateway: z.string().optional(),
    transactionDate: z.string().optional(),
    accountNumber: z.string().optional(),
    code: z.string().nullable().optional(),
    content: z.string(),
    transferType: z.string(),
    transferAmount: z.number(),
    accumulated: z.number().optional(),
    subAccount: z.string().nullable().optional(),
    referenceCode: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .passthrough();

export type SepayWebhookInput = z.infer<typeof SepayWebhookSchema>;

// ── Design Generation & Query Schemas (Ticket #44) ───────────────────────────

const MAX_TEXT_LEN = 2_000;
const DATA_URL_RE = /^data:/i;
const URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const BASE64_BLOB_RE = /^[A-Za-z0-9+/=\s]{256,}$/;
const OBJECT_KEY_RE = /^(quarantine|ready|public)\//i;

/**
 * Reusable refinement: safe text field that rejects:
 * - data URLs (INLINE_IMAGE_NOT_ALLOWED)
 * - arbitrary URLs (URL_NOT_ALLOWED)
 * - storage object keys (OBJECT_KEY_NOT_ALLOWED)
 * - base64 blobs >= 256 chars (INLINE_IMAGE_NOT_ALLOWED)
 * - strings longer than 2,000 characters
 */
export const safeText = z
  .string({ message: "Must be a string" })
  .trim()
  .max(MAX_TEXT_LEN, { message: `Must not exceed ${MAX_TEXT_LEN} chars` })
  .refine((v) => !DATA_URL_RE.test(v), {
    message: "INLINE_IMAGE_NOT_ALLOWED: Must not contain a data URL",
  })
  .refine((v) => !URL_RE.test(v), {
    message: "URL_NOT_ALLOWED: Must not contain a URL",
  })
  .refine((v) => !OBJECT_KEY_RE.test(v), {
    message: "OBJECT_KEY_NOT_ALLOWED: Must not contain an object key",
  })
  .refine((v) => !BASE64_BLOB_RE.test(v), {
    message: "INLINE_IMAGE_NOT_ALLOWED: Must not contain inline image data",
  });

export const DesignOptionsSchema = z
  .object({
    aspect_ratio: z
      .enum(["1:1", "16:9", "9:16", "4:3", "3:4", "2:1"], {
        message: "unsupported aspect_ratio",
      })
      .optional(),
    num_outputs: z
      .number({ message: "num_outputs must be a number" })
      .int({ message: "num_outputs must be an integer" })
      .min(1, { message: "num_outputs must be at least 1" })
      .max(4, { message: "num_outputs must be at most 4" })
      .optional(),
    resolution: safeText.optional(),
    quality: safeText.optional(),
  })
  .strict();

export type DesignOptionsInput = z.infer<typeof DesignOptionsSchema>;

export const InteriorIntentSchema = z
  .object({
    mode: z.enum(["redesign", "edit"]).optional(),
    roomType: safeText.optional(),
    customRoomType: safeText.optional(),
    style: safeText.optional(),
    customStyle: safeText.optional(),
    colorScheme: safeText.optional(),
    customColorScheme: safeText.optional(),
    requirements: safeText.optional(),
    editInstruction: safeText.optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.mode === "edit") {
        return Boolean(data.editInstruction?.trim() || data.requirements?.trim());
      }
      return true;
    },
    { message: "edit mode requires editInstruction or requirements" }
  );

export type InteriorIntentInput = z.infer<typeof InteriorIntentSchema>;

export const ExteriorIntentSchema = z
  .object({
    mode: z.enum(["redesign", "edit"]).optional(),
    area: safeText.optional(),
    customArea: safeText.optional(),
    style: safeText.optional(),
    customStyle: safeText.optional(),
    colorScheme: safeText.optional(),
    customColorScheme: safeText.optional(),
    requirements: safeText.optional(),
    editInstruction: safeText.optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.mode === "edit") {
        return Boolean(data.editInstruction?.trim() || data.requirements?.trim());
      }
      return true;
    },
    { message: "edit mode requires editInstruction or requirements" }
  );

export type ExteriorIntentInput = z.infer<typeof ExteriorIntentSchema>;

export const FloorPlanMarkerSchema = z
  .object({
    x: z
      .number({ message: "marker x must be a number" })
      .min(0, { message: "marker x must be >= 0" })
      .max(100, { message: "marker x must be <= 100" }),
    y: z
      .number({ message: "marker y must be a number" })
      .min(0, { message: "marker y must be >= 0" })
      .max(100, { message: "marker y must be <= 100" }),
  })
  .strict();

export const FloorPlanIntentSchema = z
  .object({
    stage: z.enum(["brief", "layout", "render", "panorama"], {
      message: "unknown floor-plan stage",
    }),
    marker: FloorPlanMarkerSchema,
    roomId: safeText.optional(),
    style: safeText.optional(),
    stylePreference: safeText.optional(),
    feedback: safeText.optional(),
    recognition: z.record(z.string(), z.unknown()).optional(),
    intake: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type FloorPlanIntentInput = z.infer<typeof FloorPlanIntentSchema>;

const BaseGenerationFields = {
  sourceAssetId: safeText.refine((v) => v.length > 0, {
    message: "sourceAssetId is required",
  }),
  mediaType: z.literal("image").optional(),
  options: DesignOptionsSchema.optional(),
  idempotencyKey: safeText.refine((v) => v.length > 0, {
    message: "idempotencyKey is required",
  }),
  provider: safeText.optional(),
  model: safeText.optional(),
};

const InteriorGenerationSchema = z
  .object({
    ...BaseGenerationFields,
    scene: z.literal("interior"),
    intent: InteriorIntentSchema,
  })
  .strict();

const ExteriorGenerationSchema = z
  .object({
    ...BaseGenerationFields,
    scene: z.literal("exterior"),
    intent: ExteriorIntentSchema,
  })
  .strict();

const FloorPlanGenerationSchema = z
  .object({
    ...BaseGenerationFields,
    scene: z.literal("floor-plan"),
    intent: FloorPlanIntentSchema,
  })
  .strict();

/**
 * Schema for POST /api/designs and POST /api/ai/generate.
 *
 * Strict validation enforcing:
 * - scene is one of: interior, exterior, floor-plan
 * - no prompt (server-built only)
 * - no image_input (server-resolved only)
 * - no inline image data (data URLs, base64 blobs)
 * - no arbitrary URLs
 * - no storage object keys
 * - rejects unknown fields (.strict() on all levels)
 */
export const DesignGenerationSchema = z.discriminatedUnion("scene", [
  InteriorGenerationSchema,
  ExteriorGenerationSchema,
  FloorPlanGenerationSchema,
]);

export type DesignGenerationInput = z.infer<typeof DesignGenerationSchema>;

// ── Design Query (Ticket #44) ──────────────────────────────────────────────

/**
 * Schema for POST /api/ai/query and GET /api/designs/[id].
 *
 * - `taskId` — non-empty safe string
 *
 * Rejects unknown fields (.strict() mode).
 */
export const DesignQuerySchema = z
  .object({
    taskId: safeText.refine((v) => v.length > 0, {
      message: "taskId is required",
    }),
  })
  .strict();

export type DesignQueryInput = z.infer<typeof DesignQuerySchema>;

