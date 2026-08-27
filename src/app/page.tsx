import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { BeforeAfter } from "@/components/landing/before-after";
import { PricingSection } from "@/components/landing/pricing-section";
import { FAQ_ITEMS } from "@/lib/catalog";
import {
  IconSofa,
  IconHousePlus,
  IconCompass,
  IconArrowRight,
  IconChevronDown,
} from "@/components/shell/icons";

export const metadata: Metadata = {
  title: "AI Home Design: Interior, Exterior & Floor Plan | HomeDesign",
  description:
    "Design your home with AI in one place. Redesign interiors from a photo, visualize exteriors before renovation, and turn floor plans into 2D layouts, 3D renders, and 360° walkthroughs.",
};

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* 1. Hero Section (Full-bleed with room image overlay matching origin) */}
      <section
        id="hero"
        className="relative isolate min-h-[min(100dvh,840px)] overflow-hidden bg-background pt-28 pb-20 md:pt-36 md:pb-24 flex items-center"
      >
        <Image
          src="/landing/hero-room-light.webp"
          alt="Warm living room preview created with HomeDesign"
          fill
          priority
          className="object-cover pointer-events-none"
        />

        {/* Gradient overlays matching origin 1:1 */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(246,240,228,0.92)_0%,rgba(246,240,228,0.72)_32%,rgba(246,240,228,0.22)_60%,rgba(246,240,228,0)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,rgba(246,240,228,0)_0%,#f6f0e4_100%)]" />

        <div className="container relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-[40rem]">
            <p className="mb-4 text-xs font-bold tracking-[0.2em] uppercase text-brand-copper md:text-sm">
              AI HOME DESIGN
            </p>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-foreground leading-[1.05]">
              See your future home in minutes
            </h1>
            <p className="mt-6 max-w-xl text-base sm:text-lg leading-relaxed text-foreground/80">
              Start with a room photo, a house photo, or an existing floor plan,
              and let AI home design show you a new direction before you renovate.
              Every home design result arrives in your browser in about a minute,
              so you can compare ideas with your family and make confident choices.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/#tools"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-brand-primary px-7 text-sm font-semibold text-white transition hover:bg-brand-accent shadow-sm active:translate-y-px"
              >
                Choose a design tool
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Three Tools Showcase Section (#tools) */}
      <section id="tools" className="scroll-mt-24 py-20 md:py-28 bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              All Your Home Design in One Place
            </h2>
            <p className="mt-4 text-base text-foreground/70 md:text-lg">
              Three AI home design workflows built around what you already have: a
              room photo, a house photo, or an existing floor plan.
            </p>
          </div>

          <div className="mt-16 space-y-16 md:space-y-24">
            {/* Tool 1: AI Interior Design */}
            <article className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
              <div>
                <div className="flex size-10 items-center justify-center rounded-xl bg-card border border-border text-foreground/80">
                  <IconSofa className="size-5" />
                </div>
                <h3 className="mt-5 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  AI Interior Design From a Room Photo
                </h3>
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-foreground/75">
                  Upload any room photo and the AI interior design engine rebuilds
                  the space in the style you choose, from modern and Scandinavian to
                  Japandi and beyond. Set the room type, pick a color direction, and
                  add notes about what to keep. Compare the refreshed room beside
                  your original photo, and only commit when an interior home design
                  feels right.
                </p>
                <Link
                  href="/ai-interior-design"
                  className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-primary px-5 text-xs font-bold text-white transition-colors hover:bg-brand-accent shadow-xs"
                >
                  <span>Try Interior Design</span>
                  <IconArrowRight className="size-4" />
                </Link>
              </div>

              <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-card shadow-md">
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
            <article className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
              <div className="lg:order-2">
                <div className="flex size-10 items-center justify-center rounded-xl bg-card border border-border text-foreground/80">
                  <IconHousePlus className="size-5" />
                </div>
                <h3 className="mt-5 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  AI Exterior Design From a House Photo
                </h3>
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-foreground/75">
                  Start with a photo of your house and preview a new facade before
                  any renovation begins. Choose the exterior area, architectural
                  style, color palette, and materials, and the AI exterior design
                  workflow renders believable home design directions for siding,
                  entryways, and outdoor spaces.
                </p>
                <Link
                  href="/ai-exterior-design"
                  className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-primary px-5 text-xs font-bold text-white transition-colors hover:bg-brand-accent shadow-xs"
                >
                  <span>Try Exterior Design</span>
                  <IconArrowRight className="size-4" />
                </Link>
              </div>

              <div className="lg:order-1 relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-card shadow-md">
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
            <article className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
              <div>
                <div className="flex size-10 items-center justify-center rounded-xl bg-card border border-border text-foreground/80">
                  <IconCompass className="size-5" />
                </div>
                <h3 className="mt-5 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  AI Floor Plan to 3D Rooms
                </h3>
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-foreground/75">
                  Upload an existing floor plan, select a room, and watch it become
                  a furnished space. The AI floor plan workflow turns flat lines
                  into a 2D furniture layout, a photorealistic 3D render, and an
                  optional 360° view you can step through. It is the fastest way to
                  test an AI home design before buying furniture.
                </p>
                <Link
                  href="/ai-floor-plan"
                  className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-primary px-5 text-xs font-bold text-white transition-colors hover:bg-brand-accent shadow-xs"
                >
                  <span>Try AI Floor Plan</span>
                  <IconArrowRight className="size-4" />
                </Link>
              </div>

              <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-card shadow-md">
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

      {/* 3. Before & After Showcase (#before-after) */}
      <section
        id="before-after"
        className="scroll-mt-24 py-20 md:py-28 border-t border-border bg-background"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Before and After
            </h2>
            <p className="mt-3 text-base text-foreground/70 md:text-lg">
              Drag the slider to compare each original photo with its new AI home design.
            </p>
          </div>

          <BeforeAfter showTabs={true} />
        </div>
      </section>

      {/* 4. Pricing Section */}
      <PricingSection />

      {/* 5. Frequently Asked Questions (#faq) */}
      <section
        id="faq"
        className="scroll-mt-24 py-20 md:py-28 border-t border-border bg-background"
      >
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="rounded-2xl border border-border bg-card divide-y divide-border/60 overflow-hidden shadow-xs">
            {FAQ_ITEMS.map((faq) => (
              <details key={faq.question} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-sm text-foreground hover:text-brand-copper transition-colors">
                  <span>{faq.question}</span>
                  <span className="ml-4 transition-transform group-open:rotate-180">
                    <IconChevronDown className="size-4" />
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

      {/* 6. Bottom CTA Banner Matching Origin 1:1 */}
      <section className="py-20 bg-background border-t border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-[#0f382c] p-8 sm:p-14 text-white shadow-xl">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Start Your AI Home<br />Design Today
              </h2>
              <p className="mt-4 text-sm sm:text-base leading-relaxed text-white/80">
                Choose the workflow that matches the photo or floor plan you already have,
                and see your first home design in about a minute. Your first AI home design
                result is only an upload away — no downloads and no design experience required.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/#tools"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-7 text-xs font-bold text-[#0f382c] shadow-sm transition hover:bg-white/90 active:translate-y-px"
                >
                  Choose a design tool
                </Link>
                <Link
                  href="/#pricing"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-white/30 bg-transparent px-7 text-xs font-bold text-white transition hover:bg-white/10"
                >
                  View pricing
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
