// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

export default tseslint.config(
  // ── Global ignores ──────────────────────────────────────────────────
  {
    ignores: [
      ".next/",
      ".open-next/",
      ".scratch/",
      ".gitnexus/",
      "node_modules/",
      "scripts/",
      "e2e/",
      // Generated type declarations — owned by tooling, not hand-edited.
      "cloudflare-env.d.ts",
      "worker-configuration.d.ts",
    ],
  },

  // ── Base JS recommended rules ───────────────────────────────────────
  eslint.configs.recommended,

  // ── TypeScript recommended (type-unaware for speed) ─────────────────
  ...tseslint.configs.recommended,

  // ── Next.js core-web-vitals rules ───────────────────────────────────
  {
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },

  // ── Project overrides ───────────────────────────────────────────────
  {
    rules: {
      // Allow _unused prefixed vars (common pattern for destructuring rest).
      // Warn-only: many existing unused imports; will be cleaned incrementally.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Pre-existing patterns — warn for now, upgrade later.
      "no-useless-assignment": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-unsafe-function-type": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
