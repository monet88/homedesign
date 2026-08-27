import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { FloorPlanFlow } from "@/components/floor-plan/floor-plan-flow";
import { FloorPlanCapabilities } from "@/components/floor-plan/floor-plan-capabilities";

export const metadata: Metadata = {
  title: "AI Floor Plan: Room Layouts, 3D Renders & 360° | HomeDesign",
  description:
    "Upload an existing floor plan, choose a room and style, then explore 2D furniture layouts, photorealistic 3D renders, and optional 360° views in your browser.",
};

export default function FloorPlanPage() {
  return (
    <div className="flex flex-col">
      {/* 1. Hero Header Banner with Cutout Visual */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-10 pb-6 sm:px-6 lg:px-8">
        <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-copper mb-2">
              AI FLOOR PLAN
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-tight">
              AI Floor Plan: Room Layouts, 3D Renders &amp; 360°
            </h1>
            <p className="mt-4 text-base leading-relaxed text-foreground/75">
              Upload an existing floor plan, choose a room and style, then explore
              2D furniture layouts, photorealistic 3D renders, and optional 360°
              views in your browser.
            </p>
          </div>

          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-brand-soft/30 shadow-sm">
            <Image
              src="/assets/ai-floor-plan/hero-floor-plan-cutout.webp"
              alt="Floor plan visualization preview"
              fill
              priority
              className="object-contain p-4"
            />
          </div>
        </div>
      </section>

      {/* 2. Interactive Floor Plan Workspace Flow */}
      <section id="floor-plan-workspace" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <Suspense
          fallback={
            <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-border bg-card p-10">
              <p className="text-sm font-semibold text-foreground/70 animate-pulse">
                Loading Floor Plan Workspace…
              </p>
            </div>
          }
        >
          <FloorPlanFlow />
        </Suspense>
      </section>

      {/* 3. Capabilities, Before & After, Pricing and FAQs */}
      <FloorPlanCapabilities />
    </div>
  );
}
