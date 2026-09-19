"use client";

import { useEffect, useRef } from "react";
import { createAuthClient } from "better-auth/react";
import { oneTapClient } from "better-auth/client/plugins";
import { useSession, triggerSessionRefresh } from "@/lib/auth/session-stub";

/** Prompt Google One Tap for anonymous visitors when GOOGLE_CLIENT_ID is configured. */
export function GoogleOneTapPrompt() {
  const { user, loading } = useSession();
  const prompted = useRef(false);

  useEffect(() => {
    // Wait until initial session check finishes to prevent race condition
    if (loading) return;

    // Avoid running on sign-in page where primary OAuth button already exists, or for logged-in users
    if (user || prompted.current) return;
    if (typeof window !== "undefined" && window.location.pathname === "/sign-in") return;

    prompted.current = true;

    async function prompt() {
      try {
        const res = await fetch("/api/auth/client-config", { cache: "no-store" });
        if (!res.ok) return;
        const cfg = (await res.json()) as { googleClientId?: string | null };
        if (!cfg.googleClientId) return;

        const client = createAuthClient({
          baseURL: window.location.origin,
          plugins: [oneTapClient({ clientId: cfg.googleClientId })],
        });

        await client.oneTap({
          fetchOptions: {
            credentials: "include",
            onSuccess: () => {
              triggerSessionRefresh();
              window.location.reload();
            },
          },
          callbackURL: typeof window !== "undefined" ? window.location.href : "/",
        }).catch(() => {
          // Gracefully ignore user dismissals or unconfigured origin errors
        });
      } catch {
        // One Tap is best-effort; email/password sign-in remains available.
      }
    }

    void prompt();
  }, [user, loading]);

  return null;
}
