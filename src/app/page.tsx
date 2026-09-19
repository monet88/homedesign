"use client";

import Link from "next/link";
import Image from "next/image";
import { BeforeAfter } from "@/components/landing/before-after";
import { PricingSection } from "@/components/landing/pricing-section";
import { OnboardingFreeClaimBanner } from "@/components/landing/onboarding-free-claim-banner";
import { useTranslation } from "@/lib/i18n/context";
import { FAQ_ITEMS } from "@/lib/catalog";
import {
  IconSofa,
  IconHousePlus,
  IconCompass,
  IconArrowRight,
  IconChevronDown,
  IconSparkles,
} from "@/components/shell/icons";

export default function Home() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col bg-background text-foreground">
      {/* 1. Hero Section (Dynamic Scandinavian Light / Obsidian Dark with Gold Accents) */}
      <section
        id="hero"
        className="relative isolate min-h-[min(92dvh,760px)] overflow-hidden bg-background pt-24 pb-16 md:pt-28 md:pb-20 flex items-center"
      >
        <Image
          src="/landing/hero-room-light.webp"
          alt="Luxury architectural room preview"
          fill
          priority
          className="object-cover pointer-events-none opacity-80 contrast-105 dark:opacity-40 dark:brightness-75 dark:contrast-125 transition-opacity duration-300"
        />

        {/* Dynamic Architectural Digest Scrim Gradients: Seamless transition in both Light & Dark */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--background)_0%,color-mix(in_srgb,var(--background)_90%,transparent)_45%,color-mix(in_srgb,var(--background)_50%,transparent)_75%,transparent_100%)] pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(180deg,transparent_0%,var(--background)_100%)] pointer-events-none" />

        <div className="container relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-[42rem]">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-600/30 bg-amber-500/10 px-3.5 py-1 mb-5 text-[11px] font-bold tracking-widest uppercase text-amber-700 dark:text-amber-400 shadow-2xs backdrop-blur-md">
              <IconSparkles className="size-3" />
              <span>{t.hero.eyebrow}</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-foreground leading-[1.08] drop-shadow-xs">
              {t.hero.headline}
            </h1>

            <p className="mt-5 max-w-xl text-sm sm:text-base leading-relaxed text-foreground/80">
              {t.hero.subtext}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <Link
                href="/#tools"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 px-7 text-xs font-bold text-slate-950 shadow-md transition-all hover:brightness-105 active:scale-[0.98]"
              >
                {t.hero.ctaPrimary}
              </Link>
              <Link
                href="/#before-after"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-border/90 bg-card/85 px-6 text-xs font-bold text-foreground backdrop-blur-md transition-all hover:bg-card hover:border-brand-primary/60 shadow-xs active:scale-[0.98]"
              >
                {t.hero.ctaSecondary}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Onboarding Free Trial Claim Banner (Zero-friction Aha! moment) */}
      <OnboardingFreeClaimBanner />

      {/* 3. Three Precision Tools Suite (#tools) */}
      <section id="tools" className="scroll-mt-20 py-20 md:py-24 bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {t.tools.title}
            </h2>
            <p className="mt-3 text-sm text-foreground/70 md:text-base max-w-2xl mx-auto">
              {t.tools.subtitle}
            </p>
          </div>

          <div className="mt-14 space-y-16 md:space-y-20">
            {/* Tool 1: AI Interior Design */}
            <article className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12 rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-md transition-all hover:shadow-xl hover:border-brand-primary/40">
              <div>
                <div className="flex size-10 items-center justify-center rounded-xl border border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 shadow-xs">
                  <IconSofa className="size-5" />
                </div>
                <h3 className="mt-5 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  {t.tools.interiorTitle}
                </h3>
                <p className="mt-3 text-xs sm:text-sm leading-relaxed text-foreground/75">
                  {t.tools.interiorDesc}
                </p>
                <Link
                  href="/ai-interior-design"
                  className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 px-5 text-xs font-bold text-slate-950 shadow-xs transition-all hover:brightness-105 active:scale-[0.98]"
                >
                  <span>{t.tools.tryInterior}</span>
                  <IconArrowRight className="size-4" />
                </Link>
              </div>

              <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border/80 bg-muted/40 shadow-inner">
                <video
                  aria-label="AI interior design demo"
                  className="size-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  poster="/landing/ai-interior-design-poster.webp"
                >
                  <source src="/landing/ai-interior-design.mp4" type="video/mp4" />
                </video>
              </div>
            </article>

            {/* Tool 2: AI Exterior Design */}
            <article className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12 rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-md transition-all hover:shadow-xl hover:border-brand-primary/40">
              <div className="lg:order-2">
                <div className="flex size-10 items-center justify-center rounded-xl border border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 shadow-xs">
                  <IconHousePlus className="size-5" />
                </div>
                <h3 className="mt-5 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  {t.tools.exteriorTitle}
                </h3>
                <p className="mt-3 text-xs sm:text-sm leading-relaxed text-foreground/75">
                  {t.tools.exteriorDesc}
                </p>
                <Link
                  href="/ai-exterior-design"
                  className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 px-5 text-xs font-bold text-slate-950 shadow-xs transition-all hover:brightness-105 active:scale-[0.98]"
                >
                  <span>{t.tools.tryExterior}</span>
                  <IconArrowRight className="size-4" />
                </Link>
              </div>

              <div className="lg:order-1 relative aspect-[16/10] overflow-hidden rounded-2xl border border-border/80 bg-muted/40 shadow-inner">
                <video
                  aria-label="AI exterior design demo"
                  className="size-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  poster="/landing/ai-exterior-design-poster.webp"
                >
                  <source src="/landing/ai-exterior-design.mp4" type="video/mp4" />
                </video>
              </div>
            </article>

            {/* Tool 3: AI Floor Plan */}
            <article className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12 rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-md transition-all hover:shadow-xl hover:border-brand-primary/40">
              <div>
                <div className="flex size-10 items-center justify-center rounded-xl border border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 shadow-xs">
                  <IconCompass className="size-5" />
                </div>
                <h3 className="mt-5 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  {t.tools.floorPlanTitle}
                </h3>
                <p className="mt-3 text-xs sm:text-sm leading-relaxed text-foreground/75">
                  {t.tools.floorPlanDesc}
                </p>
                <Link
                  href="/ai-floor-plan"
                  className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 px-5 text-xs font-bold text-slate-950 shadow-xs transition-all hover:brightness-105 active:scale-[0.98]"
                >
                  <span>{t.tools.tryFloorPlan}</span>
                  <IconArrowRight className="size-4" />
                </Link>
              </div>

              <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border/80 bg-muted/40 shadow-inner">
                <video
                  aria-label="AI floor plan demo"
                  className="size-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  poster="/landing/ai-floor-plan-poster.webp"
                >
                  <source src="/landing/ai-floor-plan.mp4" type="video/mp4" />
                </video>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* 4. Curated Showcase Gallery (#before-after) */}
      <section
        id="before-after"
        className="scroll-mt-20 py-20 md:py-24 border-t border-border/50 bg-background"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {t.beforeAfter.title}
            </h2>
            <p className="mt-3 text-sm text-foreground/70 md:text-base">
              {t.beforeAfter.subtitle}
            </p>
          </div>

          <BeforeAfter showTabs={true} />
        </div>
      </section>

      {/* 5. Pricing Section with Currency Switcher */}
      <PricingSection />

      {/* 6. Frequently Asked Questions (#faq) */}
      <section
        id="faq"
        className="scroll-mt-20 py-20 md:py-24 border-t border-border/50 bg-background"
      >
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {t.faq.title}
            </h2>
            <p className="mt-3 text-xs sm:text-sm text-foreground/70">
              {t.faq.subtitle}
            </p>
          </div>

          <div className="rounded-3xl border border-border bg-card/90 divide-y divide-border/60 overflow-hidden shadow-sm backdrop-blur-xs">
            {t.faq.items.map((faq) => (
              <details key={faq.question} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-sm text-foreground hover:text-brand-primary transition-colors">
                  <span>{faq.question}</span>
                  <span className="ml-4 transition-transform group-open:rotate-180">
                    <IconChevronDown className="size-4 text-brand-primary/70" />
                  </span>
                </summary>
                <p className="mt-3 text-xs sm:text-sm leading-relaxed text-foreground/75">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Bottom Luxury CTA Banner */}
      <section className="py-20 bg-background border-t border-border/50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-brand-primary/25 bg-gradient-to-br from-card via-muted/60 to-brand-primary/15 p-8 sm:p-14 text-foreground shadow-xl">
            <div className="pointer-events-none absolute -right-20 -bottom-20 size-72 rounded-full bg-brand-primary/10 blur-3xl" />
            <div className="max-w-2xl relative z-10">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
                {t.ctaBanner.title}
              </h2>
              <p className="mt-4 text-xs sm:text-sm leading-relaxed text-foreground/80">
                {t.ctaBanner.desc}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/#tools"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-7 text-xs font-bold text-slate-950 shadow-md transition hover:brightness-110 active:scale-[0.98]"
                >
                  {t.ctaBanner.ctaPrimary}
                </Link>
                <Link
                  href="/#pricing"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card/80 px-7 text-xs font-semibold text-foreground transition hover:bg-card"
                >
                  {t.ctaBanner.ctaSecondary}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
