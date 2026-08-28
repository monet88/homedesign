// Unit tests for the app-shell pure helpers (ticket 02 ACs).
// Run via `npm test` (vitest, no Worker bindings).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAnonymousSession, deriveSessionUser } from "@/lib/auth/session-stub";
import { NAV_LINKS, FOOTER_COLUMNS, LEGAL_LINKS } from "@/lib/nav";

// Token contract from DESIGN.md §3 — the CSS custom properties live in
// src/app/globals.css and the Tailwind theme maps them to utility classes.
const TOKENS = {
  "--paper": "#f6f0e4",
  "--ink": "#171411",
  "--radius-pill": "9999px",
  "--radius-card": "12px",
} as const;

describe("design tokens (DESIGN.md §3)", () => {
  it("exposes paper, ink, pill radius and card radius as CSS custom properties", () => {
    const css = readGlobalsCss();
    for (const [name, value] of Object.entries(TOKENS)) {
      expect(css).toContain(`${name}: ${value}`);
    }
  });

  it("maps tokens to Tailwind theme utilities used by the shell", () => {
    const css = readGlobalsCss();
    expect(css).toContain("--color-paper: #f6f0e4");
    expect(css).toContain("--color-ink: #171411");
    expect(css).toContain("--radius-card: 12px");
    expect(css).toContain("--radius-pill: 9999px");
  });
});

describe("session stub (AC2 — header auth states)", () => {
  it("anonymous session has no user and no credits", () => {
    const session = getAnonymousSession();
    expect(session.user).toBeNull();
    expect(session.credits).toBeNull();
  });

  it("anonymous session reference is stable (server-render safe)", () => {
    expect(getAnonymousSession()).toBe(getAnonymousSession());
  });

  it("derives avatar initial from name", () => {
    expect(deriveSessionUser({ name: "Claude" }).initial).toBe("C");
  });

  it("falls back to email local-part when no name is present", () => {
    const user = deriveSessionUser({ email: "monet@example.com" });
    expect(user.name).toBe("monet@example.com");
    expect(user.initial).toBe("M");
  });

  it("falls back to Guest when nothing is present", () => {
    const user = deriveSessionUser({});
    expect(user.name).toBe("Guest");
    expect(user.initial).toBe("G");
  });
});

describe("nav structure (DESIGN.md §1 / §4)", () => {
  it("header nav links point at the four landing anchors", () => {
    expect(NAV_LINKS.map((l) => l.href)).toEqual([
      "/#tools",
      "/#before-after",
      "/#pricing",
      "/#faq",
    ]);
  });

  it("footer has the three DESIGN.md columns", () => {
    expect(FOOTER_COLUMNS.map((c) => c.title)).toEqual([
      "Design Tools",
      "Resources",
      "About",
    ]);
  });

  it("legal links cover privacy and terms", () => {
    expect(LEGAL_LINKS.map((l) => l.label).sort()).toEqual([
      "Privacy Policy",
      "Terms of Service",
    ]);
  });
});

function readGlobalsCss(): string {
  // Vitest runs from the repo root; globals.css is under src/app.
  // Reading it here keeps the token contract provable in `npm test` without
  // a build step.
  return readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
}
