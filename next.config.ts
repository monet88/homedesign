import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Turbopack is the default bundler in Next 16; keep it stable.
  // ADR 0006: this app runs on Cloudflare Workers via OpenNext (nodejs_compat).
  // Do NOT add `export const runtime = "edge"` anywhere — OpenNext does not support it.
  // Note: no `output: "standalone"` — OpenNext wraps the standard `next build` output.
};

export default nextConfig;

initOpenNextCloudflareForDev();
