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

  // OpenNext requires this self-reference service binding.
  WORKER_SELF_REFERENCE: Fetcher;
  ASSETS: Fetcher;
}

// Wrangler-generated types (`wrangler types --env-interface CloudflareEnv`)
// will extend/augment this file. Keep `CloudflareEnv` in sync with `Env`.
export type CloudflareEnv = Env;
