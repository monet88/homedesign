"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/lib/auth/session-stub";

/**
 * Global Referral Funnel Tracker.
 * 1. Automatically captures `?ref=<code|slug>` on any landing/page URL.
 * 2. Increments the click counter via `POST /api/referral/track-click` (deduplicated per session).
 * 3. Persists the referral code in localStorage and Cookie (30-day attribution window).
 * 4. Automatically claims the referral via `POST /api/referral/claim` when the referee signs in/signs up.
 */
export function ReferralTracker() {
  const { user } = useSession();
  const hasTrackedClick = useRef(false);
  const hasAttemptedClaim = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const refParam = urlParams.get("ref");

      if (refParam && refParam.trim()) {
        const cleanRef = refParam.trim().toLowerCase();

        // 1. Save to localStorage & 30-day cookie
        try {
          localStorage.setItem("hd_referral_code", cleanRef);
          document.cookie = `hd_ref=${encodeURIComponent(cleanRef)}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
        } catch {
          // ignore
        }

        // 2. Track click (once per session to prevent spam counter increment)
        if (!hasTrackedClick.current) {
          hasTrackedClick.current = true;
          const sessionKey = `hd_ref_click_${cleanRef}`;
          if (!sessionStorage.getItem(sessionKey)) {
            sessionStorage.setItem(sessionKey, "1");
            fetch("/api/referral/track-click", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: cleanRef }),
            }).catch(() => {});
          }
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // When user is authenticated, attempt to bind pending referral
  useEffect(() => {
    if (typeof window === "undefined" || !user || hasAttemptedClaim.current) return;

    let pendingCode: string | null = null;
    try {
      pendingCode = localStorage.getItem("hd_referral_code");
      if (!pendingCode) {
        const match = document.cookie.match(/(?:^|;\s*)hd_ref=([^;]+)/);
        if (match) {
          pendingCode = decodeURIComponent(match[1]);
        }
      }
    } catch {
      // ignore
    }

    if (pendingCode && pendingCode.trim()) {
      hasAttemptedClaim.current = true;
      const codeToClaim = pendingCode.trim().toLowerCase();

      fetch("/api/referral/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeToClaim }),
      })
        .then((res) => res.json())
        .then((data: unknown) => {
          const resp = data as { code?: number; error?: string; success?: boolean };
          if (
            resp.code === 0 ||
            resp.error === "ALREADY_REFERRED" ||
            resp.error === "INVALID_CODE"
          ) {
            try {
              localStorage.removeItem("hd_referral_code");
              document.cookie = "hd_ref=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
            } catch {
              // ignore
            }
          }
        })
        .catch(() => {});
    }
  }, [user]);

  return null;
}
