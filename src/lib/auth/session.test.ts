// Unit tests for the client-side session hook (tickets 02 + 03).
// Run via `npm test` (vitest, no Worker bindings).

import { describe, expect, it, vi, afterEach } from "vitest";
import {
  getAnonymousSession,
  deriveSessionUser,
  fetchSession,
  toShellSession,
  triggerSessionRefresh,
  type Session,
} from "@/lib/auth/session-stub";

const AUTH_SESSION = {
  session: {
    id: "sess-1",
    userId: "u-1",
    expiresAt: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
  },
  user: {
    id: "u-1",
    name: "Claude Monet",
    email: "monet@example.com",
    emailVerified: true,
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
  },
} as const;

describe("toShellSession (session shape contract)", () => {
  it("maps a BetterAuth get-session response onto the shell Session", async () => {
    // toShellSession now also fetches /api/credits; stub it to return 10.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { available: 10 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    const shell = await toShellSession(AUTH_SESSION);
    expect(shell.user?.name).toBe("Claude Monet");
    expect(shell.user?.initial).toBe("C");
    expect(shell.user?.email).toBe("monet@example.com");
    expect(shell.user?.emailVerified).toBe(true);
    expect(shell.user?.role).toBe("user");
    expect(shell.credits).toBe(10);
  });

  it("never leaks the session token into the shell Session", async () => {
    // The session payload type has no token field; guard against regressions
    // that would reintroduce it (ADR 0001 redaction).
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { available: 10 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    const shell = (await toShellSession(AUTH_SESSION)) as Session & {
      user?: { token?: unknown };
    };
    expect((shell as unknown as { token?: unknown }).token).toBeUndefined();
    expect(shell.user?.token).toBeUndefined();
  });

  it("anonymous response maps to the stable anonymous session", async () => {
    expect(await toShellSession(null)).toBe(getAnonymousSession());
  });
});

describe("fetchSession (GET /api/auth/get-session)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it("returns null on non-OK responses (e.g. 403/500)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("error", { status: 500 }))
    );
    expect(await fetchSession()).toBeNull();
  });

  it("returns null for anonymous (200 null body)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("null", {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    expect(await fetchSession()).toBeNull();
  });

  it("parses a signed-in response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(AUTH_SESSION), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    const data = await fetchSession();
    expect(data?.user.email).toBe("monet@example.com");
  });
});

describe("deriveSessionUser (pure helper, ticket 02 contract)", () => {
  it("uses name when present", () => {
    expect(deriveSessionUser({ name: "Ada" }).name).toBe("Ada");
  });
  it("falls back to email local-part", () => {
    expect(deriveSessionUser({ email: "ada@example.com" }).name).toBe("ada@example.com");
  });
  it("falls back to Guest", () => {
    expect(deriveSessionUser({}).name).toBe("Guest");
  });
});

describe("getAnonymousSession", () => {
  it("is stable and empty", () => {
    expect(getAnonymousSession()).toBe(getAnonymousSession());
    expect(getAnonymousSession().user).toBeNull();
    expect(getAnonymousSession().credits).toBeNull();
    expect(getAnonymousSession().loading).toBe(false);
  });
});

describe("triggerSessionRefresh", () => {
  it("dispatches homedesign:session-changed event in window environment", () => {
    const dispatchSpy = vi.fn();
    vi.stubGlobal("window", { dispatchEvent: dispatchSpy });
    triggerSessionRefresh();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
