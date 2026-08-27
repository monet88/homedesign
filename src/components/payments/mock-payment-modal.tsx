"use client";

import { useCallback, useState } from "react";
import { PRICING_TIERS, type PricingTier } from "@/lib/catalog";

const PACK_BY_NAME: Record<string, "lite" | "plus" | "pro" | "max"> = {
  Lite: "lite",
  Plus: "plus",
  Pro: "pro",
  Max: "max",
};

interface MockPaymentModalProps {
  open: boolean;
  onClose: () => void;
  onPurchased?: () => void;
  message?: string | null;
}

export function MockPaymentModal({ open, onClose, onPurchased, message }: MockPaymentModalProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const purchase = useCallback(
    async (tier: PricingTier) => {
      const pack = PACK_BY_NAME[tier.name];
      if (!pack) return;
      setBusy(tier.name);
      setError(null);
      try {
        const res = await fetch("/api/payments/mock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            pack,
            idempotencyKey: `mock-${pack}-${crypto.randomUUID()}`,
          }),
        });
        const json = (await res.json()) as { error?: string; code?: number };
        if (!res.ok || json.code !== 0) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        onPurchased?.();
        onClose();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [onClose, onPurchased]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mock-payment-title"
    >
      <div className="w-full max-w-lg rounded-card border border-ink/10 bg-paper p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="mock-payment-title" className="text-lg font-semibold text-ink">
              Buy Credits
            </h2>
            <p className="mt-1 text-sm text-ink/60">Mock purchase — no charge</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink/50 hover:text-ink"
          >
            ✕
          </button>
        </div>

        {message && (
          <p className="mt-4 rounded-card border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {message}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <ul className="mt-6 space-y-3">
          {PRICING_TIERS.map((tier) => (
            <li key={tier.name}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => purchase(tier)}
                className="flex w-full items-center justify-between rounded-card border border-ink/10 px-4 py-3 text-left transition-colors hover:bg-ink/5 disabled:opacity-50"
              >
                <span>
                  <span className="font-medium text-ink">{tier.name}</span>
                  <span className="ml-2 text-sm text-ink/60">{tier.credits} credits</span>
                </span>
                <span className="text-sm font-medium text-ink">
                  {busy === tier.name ? "Processing…" : tier.price}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
