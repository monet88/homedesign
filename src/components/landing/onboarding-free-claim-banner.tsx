"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, triggerSessionRefresh } from "@/lib/auth/session-stub";
import { useTranslation } from "@/lib/i18n/context";
import { getClientFingerprint } from "@/lib/client-fingerprint";
import { IconSparkles, IconCheck, IconClose, IconAlert } from "@/components/shell/icons";
import Link from "next/link";

interface ClaimNotice {
  type: "success" | "error";
  message: string;
  showPricing?: boolean;
}

export function OnboardingFreeClaimBanner() {
  const { user } = useSession();
  const { t } = useTranslation();
  const [hasClaimed, setHasClaimed] = useState<boolean | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [notice, setNotice] = useState<ClaimNotice | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const isClaimingRef = useRef(false);

  useEffect(() => {
    if (!user) {
      setHasClaimed(false);
      return;
    }

    async function checkClaim() {
      try {
        const res = await fetch("/api/credits/claim-free", { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as { code: number; data?: { hasClaimed: boolean } };
          if (json.code === 0 && json.data) {
            setHasClaimed(json.data.hasClaimed);
          }
        }
      } catch {
        // Non-fatal
      }
    }
    void checkClaim();
  }, [user]);

  // If already claimed or dismissed, do not show
  if (dismissed || hasClaimed === true) {
    return null;
  }

  const handleClaim = async () => {
    if (!user || isClaimingRef.current || claiming || hasClaimed) return;
    isClaimingRef.current = true;
    setClaiming(true);
    setNotice(null);

    try {
      const fp = await getClientFingerprint();
      const res = await fetch("/api/credits/claim-free", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fingerprint: fp }),
      });

      const json = (await res.json()) as {
        code?: number;
        data?: { amount: number; newBalance: number; message: string };
        error?: string;
        message?: string;
      };

      if (res.ok && json.code === 0) {
        setHasClaimed(true);
        setNotice({
          type: "success",
          message: t.claimBanner.claimedSuccess,
        });
        triggerSessionRefresh();
        setTimeout(() => setDismissed(true), 4500);
      } else {
        const isRateLimit = json.error === "DEVICE_CLAIM_LIMIT_REACHED" || json.error === "IP_CLAIM_LIMIT_REACHED";
        setNotice({
          type: "error",
          message: json.message || "Không thể nhận credit lúc này.",
          showPricing: isRateLimit,
        });
      }
    } catch {
      setNotice({
        type: "error",
        message: "Lỗi kết nối mạng. Vui lòng thử lại sau.",
      });
    } finally {
      isClaimingRef.current = false;
      setClaiming(false);
    }
  };

  return (
    <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">
      <div className="relative isolate overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-card/90 to-amber-950/30 p-4 sm:p-5 shadow-lg backdrop-blur-md">
        {/* Subtle gold accent light */}
        <div className="pointer-events-none absolute -top-12 -left-12 size-36 rounded-full bg-amber-500/15 blur-2xl" />

        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-xs">
              <IconSparkles className="size-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">
                {t.claimBanner.title}
              </h4>
              <p className="mt-0.5 text-xs text-foreground/75 leading-relaxed max-w-xl">
                {t.claimBanner.desc}
              </p>
              {notice && (
                <div
                  className={`mt-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold ${
                    notice.type === "success" ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {notice.type === "success" ? (
                    <IconCheck className="size-4 shrink-0 text-emerald-400" />
                  ) : (
                    <IconAlert className="size-4 shrink-0 text-amber-400" />
                  )}
                  <span>{notice.message}</span>
                  {notice.showPricing && (
                    <Link
                      href="/pricing"
                      className="ml-1.5 inline-flex items-center rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-300 underline underline-offset-2 transition hover:bg-amber-500/30"
                    >
                      Xem Bảng Giá →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
            {user ? (
              <button
                type="button"
                onClick={() => void handleClaim()}
                disabled={claiming || Boolean(hasClaimed)}
                className="flex h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-4 text-xs font-bold text-slate-950 shadow-md transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                <IconSparkles className="size-3.5" />
                <span>{claiming ? t.common.claiming : t.claimBanner.button}</span>
              </button>
            ) : (
              <Link
                href="/sign-in"
                className="flex h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-4 text-xs font-bold text-slate-950 shadow-md transition-all hover:brightness-110 active:scale-[0.98]"
              >
                <IconSparkles className="size-3.5" />
                <span>{t.common.signIn} &amp; {t.common.claimFree}</span>
              </Link>
            )}

            <button
              type="button"
              aria-label="Dismiss banner"
              onClick={() => setDismissed(true)}
              className="rounded-lg p-1.5 text-foreground/40 transition hover:bg-white/5 hover:text-foreground/80"
            >
              <IconClose className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
