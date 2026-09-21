/// <reference types="vitest" />
import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Vitest config for Workers-runtime tests.
// Runs inside miniflare with real D1/R2/Queue bindings from wrangler.jsonc.
// Uses the test-helper worker entry so tests don't depend on an OpenNext build.
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./tests/worker-entry.ts",
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.wtest.ts", "tests/**/*.wtest.ts"],
    exclude: ["node_modules", ".open-next", ".next"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});