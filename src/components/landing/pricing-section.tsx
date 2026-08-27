"use client";

import { useState } from "react";
import { PRICING_TIERS } from "@/lib/catalog";
import { MockPaymentModal } from "@/components/payments/mock-payment-modal";

export function PricingSection() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <section id="pricing" className="border-t border-ink/10 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-ink">
            Pricing
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-ink/60">
            Free credits to start. Every pack is a mock purchase in this build —
            no charge.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className="rounded-card border border-ink/10 bg-paper p-6 shadow-sm"
              >
                <h3 className="text-lg font-semibold text-ink">{tier.name}</h3>
                <p className="mt-2 text-sm text-ink/60">{tier.credits} credits</p>
                <p className="mt-3 text-3xl font-semibold text-ink">{tier.price}</p>
                <p className="mt-1 text-xs text-ink/50">{tier.priceNote}</p>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="mt-4 w-full rounded-pill bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80"
                >
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <MockPaymentModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
