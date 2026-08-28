"use client";

import { useState } from "react";
import { MockPaymentModal } from "@/components/payments/mock-payment-modal";
import { IconCheck, IconSparkles } from "@/components/shell/icons";

interface PricingTier {
  name: string;
  price: string;
  originalPrice?: string;
  credits: number;
  description: string;
  badge?: string;
  features: string[];
}

const TIERS: PricingTier[] = [
  {
    name: "Lite",
    price: "$5",
    credits: 80,
    description: "For trying one or two room designs",
    features: ["80 credits", "Credits valid for 30 days"],
  },
  {
    name: "Plus",
    price: "$9",
    originalPrice: "$10",
    credits: 160,
    description: "For one complete design project",
    features: [
      "160 credits",
      "10% off",
      "Credits valid for 60 days",
      "Enough for a typical 7-room home",
    ],
  },
  {
    name: "Pro",
    price: "$17",
    originalPrice: "$20",
    credits: 320,
    description: "For more styles, revisions, and rooms",
    badge: "Popular",
    features: [
      "320 credits",
      "15% off",
      "Credits valid for 90 days",
      "Great for comparing design directions",
    ],
  },
  {
    name: "Max",
    price: "$32",
    originalPrice: "$40",
    credits: 640,
    description: "For multiple homes or larger projects",
    badge: "Best Value",
    features: [
      "640 credits",
      "20% off",
      "Credits valid for 180 days",
      "Best value for larger projects",
    ],
  },
];

const CREDIT_USAGE = [
  { action: "Room concept", credits: "1 credit" },
  { action: "2D room plan", credits: "2 credits" },
  { action: "Realistic render", credits: "3 credits" },
  { action: "360 preview", credits: "4 credits" },
  { action: "Nano Banana", credits: "1 credit" },
  { action: "Nano Banana 2 1K", credits: "2 credits" },
  { action: "Nano Banana 2 2K", credits: "3 credits" },
  { action: "Nano Banana 2 4K", credits: "4 credits" },
  { action: "Nano Banana Pro 1K", credits: "3 credits" },
  { action: "Nano Banana Pro 2K", credits: "3 credits" },
  { action: "Nano Banana Pro 4K", credits: "5 credits" },
  { action: "GPT Image 2 Low", credits: "1 credit" },
  { action: "GPT Image 2 Medium", credits: "2 credits" },
  { action: "GPT Image 2 High", credits: "5 credits" },
];

export function PricingSection() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <section id="pricing" className="scroll-mt-24 py-20 md:py-28 bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Pricing
            </h2>
            <p className="mt-2 text-sm text-foreground/70 md:text-base">
              Choose the package that fits your project.
            </p>
          </div>

          {/* Pricing Cards Grid */}
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className="relative flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-6 shadow-2xs transition-all hover:shadow-md"
              >
                {tier.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#c26e38] px-3 py-0.5 text-[11px] font-semibold text-white shadow-xs">
                    {tier.badge}
                  </span>
                )}

                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    {tier.name}
                  </h3>
                  <div className="my-3 flex items-baseline gap-2">
                    {tier.originalPrice && (
                      <span className="text-xs text-foreground/40 line-through">
                        {tier.originalPrice}
                      </span>
                    )}
                    <span className="text-3xl font-bold tracking-tight text-foreground">
                      {tier.price}
                    </span>
                  </div>
                  <p className="min-h-[2.5rem] text-xs text-foreground/65">
                    {tier.description}
                  </p>

                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="mt-5 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-primary text-xs font-bold text-white transition-all hover:bg-brand-accent shadow-xs active:translate-y-px"
                  >
                    <IconSparkles className="size-3.5" />
                    <span>Buy Credits</span>
                  </button>

                  <hr className="my-6 border-dashed border-border" />

                  <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/60">
                    Includes:
                  </p>
                  <ul className="mt-3 space-y-2.5 text-xs text-foreground/80">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <IconCheck className="mt-0.5 size-3 shrink-0 text-brand-primary" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {/* Credit Usage Breakdown */}
          <div className="mx-auto mt-20 max-w-3xl">
            <h3 className="mb-6 text-center text-xl font-bold text-foreground">
              How credits are used
            </h3>
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/60 divide-y divide-border/60 shadow-2xs backdrop-blur-xs">
              {CREDIT_USAGE.map((row) => (
                <div
                  key={row.action}
                  className="flex items-center justify-between px-6 py-3.5 text-xs sm:text-sm"
                >
                  <span className="font-medium text-foreground/90">{row.action}</span>
                  <span className="font-semibold text-foreground/75">{row.credits}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <MockPaymentModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
