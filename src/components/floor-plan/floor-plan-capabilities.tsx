"use client";

import { PricingSection } from "@/components/landing/pricing-section";
import { BeforeAfter } from "@/components/landing/before-after";
import { FAQ_FLOOR_PLAN } from "@/lib/catalog";
import {
  IconCompass,
  IconSofa,
  IconSparkles,
  IconGlobe,
  IconHousePlus,
} from "@/components/shell/icons";

const CAPABILITIES = [
  {
    title: "Floor Plan Recognition",
    description:
      "Detect room boundaries, doors, windows, and structural partitions automatically from any clear 2D floor plan image.",
    icon: IconCompass,
  },
  {
    title: "12+ Design Style Presets",
    description:
      "Apply curated interior design styles — Modern Warm, Japandi, Scandinavian, Minimal, Industrial, Luxury Wood and more.",
    icon: IconSofa,
  },
  {
    title: "2D Furniture Layouts",
    description:
      "Generate clean architectural 2D floor plans with proportional furniture layouts, clearance zones, and traffic flow.",
    icon: IconHousePlus,
  },
  {
    title: "Room-Level Selection",
    description:
      "Click any room marker on your plan to independently visualize each bedroom, kitchen, living space, or bath.",
    icon: IconCompass,
  },
  {
    title: "Photorealistic 3D Renders",
    description:
      "Transform flat floor plan boundaries into high-definition photorealistic 3D room renders with natural lighting and realistic textures.",
    icon: IconSparkles,
  },
  {
    title: "360° Panorama Walkthrough",
    description:
      "Generate interactive 360° equirectangular panoramas you can pan and rotate directly inside your browser.",
    icon: IconGlobe,
  },
];

export function FloorPlanCapabilities() {
  const scrollToUploader = () => {
    const el = document.getElementById("floor-plan-workspace");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-24 py-16">
      {/* 1. Six Capabilities Grid */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            From Flat Blueprint to Photorealistic Living Spaces
          </h2>
          <p className="mt-3 text-base text-foreground/70">
            A specialized multi-stage pipeline designed specifically for architectural floor plans.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((cap) => {
            const Icon = cap.icon;
            return (
              <div
                key={cap.title}
                className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-xs transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand-primary mb-4">
                  <Icon className="size-5" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {cap.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/75">
                  {cap.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Before & After Showcase */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="mx-auto max-w-2xl text-center mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Floor Plan Transformation Showcase
          </h2>
          <p className="mt-2 text-sm text-foreground/70">
            Compare 2D input floor plans with their corresponding photorealistic 3D renders.
          </p>
        </div>

        <BeforeAfter initialTab="floor-plan" showTabs={false} />
      </section>

      {/* 3. Pricing Section */}
      <PricingSection />

      {/* 4. Floor Plan FAQ */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Frequently Asked Questions About AI Floor Plan
          </h2>
        </div>

        <div className="rounded-2xl border border-border bg-card divide-y divide-border/60 overflow-hidden shadow-xs">
          {FAQ_FLOOR_PLAN.map((faq) => (
            <details key={faq.question} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-foreground hover:text-brand-copper transition-colors">
                <span>{faq.question}</span>
                <span className="ml-4 transition-transform group-open:rotate-180">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-foreground/75">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* 5. Bottom CTA Banner */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-brand-soft/40 p-8 sm:p-12 text-center shadow-sm">
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Ready to bring your floor plan to life?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-foreground/70">
            Upload your architectural drawing and step into a 3D rendered space today.
          </p>
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={scrollToUploader}
              className="rounded-full bg-brand-primary px-8 py-3 text-sm font-semibold text-brand-ivory transition-colors hover:bg-brand-accent shadow-md"
            >
              Upload Floor Plan
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
