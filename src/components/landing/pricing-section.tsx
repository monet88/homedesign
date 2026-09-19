"use client";

import { useState } from "react";
import { MockPaymentModal } from "@/components/payments/mock-payment-modal";
import { useTranslation } from "@/lib/i18n/context";
import { IconCheck, IconSparkles } from "@/components/shell/icons";

import { UNIFIED_PRICING_TIERS } from "@/lib/payments/pricing-constants";

interface PricingTier {
  id: string;
  name: string;
  nameVi: string;
  usdPrice: string;
  vndPrice: string;
  originalUsdPrice?: string;
  originalVndPrice?: string;
  credits: number;
  description: string;
  descriptionVi: string;
  badge?: string;
  features: string[];
  featuresVi: string[];
}

const TIERS: PricingTier[] = [
  {
    id: "lite",
    name: "Lite",
    nameVi: UNIFIED_PRICING_TIERS.lite.nameVi,
    usdPrice: UNIFIED_PRICING_TIERS.lite.usdPriceFormatted,
    vndPrice: UNIFIED_PRICING_TIERS.lite.vndPriceFormatted,
    credits: UNIFIED_PRICING_TIERS.lite.credits,
    description: UNIFIED_PRICING_TIERS.lite.description,
    descriptionVi: UNIFIED_PRICING_TIERS.lite.descriptionVi,
    features: UNIFIED_PRICING_TIERS.lite.features,
    featuresVi: UNIFIED_PRICING_TIERS.lite.featuresVi,
  },
  {
    id: "plus",
    name: "Plus",
    nameVi: UNIFIED_PRICING_TIERS.plus.nameVi,
    usdPrice: UNIFIED_PRICING_TIERS.plus.usdPriceFormatted,
    vndPrice: UNIFIED_PRICING_TIERS.plus.vndPriceFormatted,
    originalUsdPrice: "$10",
    originalVndPrice: "450.000₫",
    credits: UNIFIED_PRICING_TIERS.plus.credits,
    description: UNIFIED_PRICING_TIERS.plus.description,
    descriptionVi: UNIFIED_PRICING_TIERS.plus.descriptionVi,
    features: UNIFIED_PRICING_TIERS.plus.features,
    featuresVi: UNIFIED_PRICING_TIERS.plus.featuresVi,
  },
  {
    id: "pro",
    name: "Pro",
    nameVi: UNIFIED_PRICING_TIERS.pro.nameVi,
    usdPrice: UNIFIED_PRICING_TIERS.pro.usdPriceFormatted,
    vndPrice: UNIFIED_PRICING_TIERS.pro.vndPriceFormatted,
    originalUsdPrice: "$20",
    originalVndPrice: "850.000₫",
    credits: UNIFIED_PRICING_TIERS.pro.credits,
    description: UNIFIED_PRICING_TIERS.pro.description,
    descriptionVi: UNIFIED_PRICING_TIERS.pro.descriptionVi,
    badge: "Popular",
    features: UNIFIED_PRICING_TIERS.pro.features,
    featuresVi: UNIFIED_PRICING_TIERS.pro.featuresVi,
  },
  {
    id: "max",
    name: "Max",
    nameVi: UNIFIED_PRICING_TIERS.max.nameVi,
    usdPrice: UNIFIED_PRICING_TIERS.max.usdPriceFormatted,
    vndPrice: UNIFIED_PRICING_TIERS.max.vndPriceFormatted,
    originalUsdPrice: "$40",
    originalVndPrice: "1.500.000₫",
    credits: UNIFIED_PRICING_TIERS.max.credits,
    description: UNIFIED_PRICING_TIERS.max.description,
    descriptionVi: UNIFIED_PRICING_TIERS.max.descriptionVi,
    badge: "Best Value",
    features: UNIFIED_PRICING_TIERS.max.features,
    featuresVi: UNIFIED_PRICING_TIERS.max.featuresVi,
  },
];

const CREDIT_USAGE_EN = [
  { action: "AI Interior / Exterior Redesign (Fal.ai / Gemini)", credits: "1 credit" },
  { action: "Virtual Staging (Furnish empty rooms)", credits: "1 credit" },
  { action: "Precision Inpainting / Local brush edit", credits: "1 credit" },
  { action: "2D Floor plan vector layout generation", credits: "2 credits" },
  { action: "Photorealistic 3D room render", credits: "3 credits" },
  { action: "360 VR Panorama interactive preview", credits: "4 credits" },
  { action: "4K Ultra-HD Upscale enhancement", credits: "2 credits" },
  { action: "B2B White-Label PDF Pitch Deck export", credits: "Free (0 credit)" },
];

const CREDIT_USAGE_VI = [
  { action: "Tái thiết kế Nội thất / Ngoại thất AI (Fal.ai / Gemini)", credits: "1 credit" },
  { action: "Dựng phối cảnh phòng trống (Virtual Staging B2B)", credits: "1 credit" },
  { action: "Chỉnh sửa cục bộ bằng cọ vẽ (Inpainting)", credits: "1 credit" },
  { action: "Khởi tạo mặt bằng phòng 2D (Layout)", credits: "2 credits" },
  { action: "Render phối cảnh 3D siêu thực từ mặt bằng", credits: "3 credits" },
  { action: "Toàn cảnh thực tế ảo 360 độ VR Panorama", credits: "4 credits" },
  { action: "Nâng cấp độ phân giải Ultra-HD 4K sắc nét", credits: "2 credits" },
  { action: "Xuất hồ sơ thuyết minh PDF Pitch Deck thương hiệu", credits: "Miễn phí (0 credit)" },
];

export function PricingSection() {
  const { t, lang } = useTranslation();
  const creditUsage = lang === "vi" ? CREDIT_USAGE_VI : CREDIT_USAGE_EN;
  const [modalOpen, setModalOpen] = useState(false);
  const isVnd = lang === "vi";

  return (
    <>
      <section id="pricing" className="scroll-mt-20 py-20 md:py-24 bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {t.pricing.title}
            </h2>
            <p className="mt-2 text-xs text-foreground/70 sm:text-sm md:text-base">
              {t.pricing.subtitle}
            </p>
          </div>

          {/* Pricing Cards Grid */}
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((tier) => {
              const displayPrice = isVnd ? tier.vndPrice : tier.usdPrice;
              const displayOriginalPrice = isVnd ? tier.originalVndPrice : tier.originalUsdPrice;

              const tierDescription = isVnd ? tier.descriptionVi : tier.description;
              const tierFeatures = isVnd ? tier.featuresVi : tier.features;

              return (
                <div
                  key={tier.name}
                  className="relative flex flex-col justify-between rounded-3xl border border-amber-500/20 bg-card/60 p-6 shadow-xl backdrop-blur-xs transition-all hover:border-amber-400/50 hover:shadow-2xl"
                >
                  {tier.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-amber-500/30 bg-gradient-to-r from-amber-600 to-amber-500 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-950 shadow-xs">
                      {tier.badge === "Popular" ? t.pricing.popularBadge : t.pricing.bestValueBadge}
                    </span>
                  )}

                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {tier.name}
                    </h3>
                    <div className="my-3 flex items-baseline gap-2">
                      {displayOriginalPrice && (
                        <span className="text-xs text-foreground/40 line-through">
                          {displayOriginalPrice}
                        </span>
                      )}
                      <span className="text-3xl font-bold tracking-tight text-foreground">
                        {displayPrice}
                      </span>
                    </div>
                    <p className="min-h-[2.5rem] text-xs text-foreground/65 leading-relaxed">
                      {tierDescription}
                    </p>

                    <button
                      type="button"
                      onClick={() => setModalOpen(true)}
                      className="mt-5 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-xs font-bold text-slate-950 shadow-md transition-all hover:brightness-110 active:scale-[0.98]"
                    >
                      <IconSparkles className="size-3.5" />
                      <span>{t.pricing.buyButton}</span>
                    </button>

                    <hr className="my-6 border-dashed border-border/60" />

                    <p className="text-[11px] font-bold uppercase tracking-wider text-brand-primary">
                      Includes:
                    </p>
                    <ul className="mt-3 space-y-2.5 text-xs text-foreground/80">
                      {tierFeatures.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <IconCheck className="mt-0.5 size-3 shrink-0 text-brand-primary" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 text-center text-xs text-foreground/50">
            {t.pricing.currencyNotice}
          </div>

          {/* Credit Usage Breakdown */}
          <div className="mx-auto mt-16 max-w-3xl">
            <h3 className="mb-6 text-center text-lg font-bold text-foreground">
              {t.pricing.usageTitle}
            </h3>
            <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border/60 shadow-sm backdrop-blur-xs">
              {creditUsage.map((row) => (
                <div
                  key={row.action}
                  className="flex items-center justify-between px-6 py-3 text-xs sm:text-sm"
                >
                  <span className="font-medium text-foreground/85">{row.action}</span>
                  <span className="font-semibold text-amber-400/90">{row.credits}</span>
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
