import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

// ADR 0006: OpenNext on Cloudflare Workers, nodejs_compat, no edge runtime.
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
