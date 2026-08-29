/// <reference types="vitest" />
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("./migrations");

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
  define: {
    __D1_MIGRATIONS__: JSON.stringify(migrations),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.wtest.ts", "tests/**/*.wtest.ts"],
    exclude: ["node_modules", ".open-next", ".next"],
  },
});