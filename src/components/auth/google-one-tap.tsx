"use client";

import { useEffect, useRef } from "react";
import { createAuthClient } from "better-auth/react";
import { oneTapClient } from "better-auth/client/plugins";
import { useSession } from "@/lib/auth/session-stub";

/** Prompt Google One Tap for anonymous visitors when GOOGLE_CLIENT_ID is configured. */
export function GoogleOneTapPrompt() {
  const { user } = useSession();
  const prompted = useRef(false);

  useEffect(() => {
    if (user || prompted.current) return;
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
          fetchOptions: { credentials: "include" },
          callbackURL: window.location.pathname,
        });
      } catch {
        // One Tap is best-effort; email/password sign-in remains available.
      }
    }

    void prompt();
  }, [user]);

  return null;
}
