import type { Metadata } from "next";
import Link from "next/link";
import { IconSofa, IconHousePlus, IconCompass, IconSparkles } from "@/components/shell/icons";

export const metadata: Metadata = {
  title: "AI Home Design Software: Modern Interior & Exterior Visualizer | HomeDesign",
  description:
    "Explore the next generation of AI home design software. Re-imagine interior rooms, renovate exterior facades, and transform floor plans in seconds.",
};

export default function HomeDesignSoftwarePage() {
  return (
    <main className="min-h-screen bg-background pt-24 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-brand-copper">
            AI ARCHITECTURAL SUITE
          </p>
          <h1 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-tight">
            AI-Powered Home Design Software
          </h1>
          <p className="mt-4 text-base sm:text-lg text-foreground/75 leading-relaxed">
            The all-in-one browser platform for homeowners, realtors, and interior architects. Create realistic 3D designs, stage empty rooms, and visualize architectural transformations in 30 seconds.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/ai-interior-design"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-primary px-6 text-sm font-semibold text-white transition hover:bg-brand-accent shadow-sm"
            >
              Try Interior Design
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-6 text-sm font-semibold text-foreground transition hover:bg-accent shadow-2xs"
            >
              View Pricing
            </Link>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-2xs hover:shadow-md transition">
            <div className="size-10 rounded-xl bg-brand-soft/60 flex items-center justify-center text-brand-primary mb-4">
              <IconSofa className="size-5" />
            </div>
            <h3 className="text-lg font-bold text-foreground">AI Interior Design</h3>
            <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
              Upload a snapshot of any living room, bedroom, kitchen, or bathroom and apply over 30 architectural aesthetics from Japandi to Modern Minimalist.
            </p>
            <Link href="/ai-interior-design" className="mt-4 inline-flex text-xs font-semibold text-brand-primary hover:underline">
              Launch tool →
            </Link>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-2xs hover:shadow-md transition">
            <div className="size-10 rounded-xl bg-brand-soft/60 flex items-center justify-center text-brand-primary mb-4">
              <IconSparkles className="size-5" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Virtual Staging</h3>
            <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
              Fill empty real estate photos with warm, premium furniture packages to boost property listings and rental attraction in minutes.
            </p>
            <Link href="/ai-virtual-staging" className="mt-4 inline-flex text-xs font-semibold text-brand-primary hover:underline">
              Launch tool →
            </Link>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-2xs hover:shadow-md transition">
            <div className="size-10 rounded-xl bg-brand-soft/60 flex items-center justify-center text-brand-primary mb-4">
              <IconHousePlus className="size-5" />
            </div>
            <h3 className="text-lg font-bold text-foreground">AI Exterior Renovation</h3>
            <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
              Experiment with new facade materials, roofing, paint palettes, and landscaping before committing to expensive contractor work.
            </p>
            <Link href="/ai-exterior-design" className="mt-4 inline-flex text-xs font-semibold text-brand-primary hover:underline">
              Launch tool →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
