// Cloudflare Worker bindings for HomeDesign (ADR 0006 runtime topology).
// These are the real bindings declared in wrangler.jsonc and exercised by the
// workers-runtime test harness (vitest-pool-workers / miniflare) and wrangler dev.

export interface Env {
  // D1 metadata (Identity, Projects/Assets, lineage, Activity, Credit Ledger).
  DB: D1Database;

  // R2 buckets (ADR 0003): private user assets (quarantine/ + ready/),
  // public static media, OpenNext incremental cache.
  HD_PRIVATE: R2Bucket;
  HD_PUBLIC: R2Bucket;
  NEXT_INC_CACHE_R2_BUCKET: R2Bucket;

  // Queues (ADR 0003 / ADR 0006): intake validation + AI provider notify.
  ASSET_VALIDATE: Queue<unknown>;
  PROVIDER_NOTIFY: Queue<unknown>;

  // Vars
  ENVIRONMENT: string;

  // AI Provider (Ticket #21 / ADR 0007)
  AI_API_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_DEFAULT_MODEL?: string;

  // R2 S3 API credentials for presigned upload URLs (ADR 0003). Set per
  // environment as secrets; local defaults live in wrangler.jsonc vars.
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;

  // Auth (ADR 0001): required names, values per environment, never committed.
  // Local defaults live in wrangler.jsonc vars / .dev.vars; production values
  // come from secrets.required + env-specific vars.
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  EMAIL_DELIVERY_MODE?: string;
  GOOGLE_CLIENT_ID?: string;
  /** Local-only: skip login for UI testing. Ignored when ENVIRONMENT=production. */
  AUTH_BYPASS?: string;
  /** Capability secret for authorized outbox access in non-production environments. */
  OUTBOX_ACCESS_SECRET?: string;
  /** Explicit flag to allow local tooling outbox access. */
  ALLOW_LOCAL_OUTBOX_ACCESS?: string;
  // OpenNext requires this self-reference service binding.
  WORKER_SELF_REFERENCE: Fetcher;
  ASSETS: Fetcher;
}

// Wrangler-generated types (`wrangler types --env-interface CloudflareEnv`)
// will extend/augment this file. Keep `CloudflareEnv` in sync with `Env`.
export type CloudflareEnv = Env;
