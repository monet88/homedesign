import Link from "next/link";
import type { Metadata } from "next";
import { BeforeAfter } from "@/components/landing/before-after";
import { CatalogCard } from "@/components/landing/catalog-card";
import { Faq } from "@/components/landing/faq";
import { PricingSection } from "@/components/landing/pricing-section";
import {
  POPULAR_STYLES,
  IDEAS,
  FAQ_ITEMS,
} from "@/lib/catalog";

export const metadata: Metadata = {
  title: "HomeDesign — AI Interior, Exterior & Floor Plan Design",
  description:
    "See your future home in minutes. Transform any room, facade, or floor plan with AI-powered interior design, exterior design, and floor-plan visualization.",
};

export default function Home() {
  return (
    <main>
      {/* Hero (DESIGN.md §5 Landing): inter 72px/600, paper/ink tokens. */}
      <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 lg:px-8">
        <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-ink sm:text-6xl lg:text-7xl">
          See your future home in minutes
        </h1>
        <p className="max-w-xl text-lg text-ink/70">
          Transform your space with AI-powered interior, exterior, and floor
          plan design.
        </p>
        <Link
          href="/#tools"
          className="rounded-pill bg-ink px-8 py-3 text-base font-medium text-paper transition-opacity hover:opacity-80"
        >
          Choose a design tool
        </Link>
      </section>

      {/* Three tools cards (DESIGN.md §5 Landing). */}
      <section
        id="tools"
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8"
      >
        <h2 className="text-center text-3xl font-semibold tracking-tight text-ink">
          All Your Home Design in One Place
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {TOOL_CARDS.map((card) => (
            <article
              key={card.title}
              className="rounded-card border border-ink/10 bg-paper p-6 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-ink">{card.title}</h3>
              <p className="mt-2 text-sm text-ink/60">{card.description}</p>
              <Link
                href={card.href}
                className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-2 transition-opacity hover:opacity-70"
              >
                {card.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* Before / After — native slider, 5 comparisons (ticket 12). */}
      <section id="before-after" className="border-t border-ink/10 py-16">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold tracking-tight text-ink">
            Before &amp; After
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-ink/60">
            Drag the slider or pick a comparison to see how AI can transform
            your space.
          </p>
          <div className="mt-8">
            <BeforeAfter />
          </div>
        </div>
      </section>

      {/* Popular Styles — 12 cards, native grid (auto-fill minmax(160px,1fr)). */}
      <section id="popular-styles" className="border-t border-ink/10 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold tracking-tight text-ink">
            Popular Styles
          </h2>
          <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
            {POPULAR_STYLES.map((item) => (
              <CatalogCard key={item.title} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* Ideas for Every Room — 10 cards, native grid. */}
      <section id="ideas" className="border-t border-ink/10 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold tracking-tight text-ink">
            Ideas for Every Room
          </h2>
          <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
            {IDEAS.map((item) => (
              <CatalogCard key={item.title} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* Pricing — free-first, mock labels (DESIGN.md §4, spec User Story 14). */}
      <PricingSection />

      {/* FAQ — accordion (DESIGN.md §4 FAQ). */}
      <section id="faq" className="border-t border-ink/10 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-ink">
            Frequently Asked Questions About AI Interior/Exterior Design
          </h2>
          <div className="mt-8">
            <Faq items={FAQ_ITEMS} />
          </div>
        </div>
      </section>
    </main>
  );
}

const TOOL_CARDS = [
  {
    title: "AI Interior Design",
    description: "Redesign any room — living room, bedroom, kitchen, and more.",
    href: "/ai-interior-design",
    cta: "Try Interior Design →",
  },
  {
    title: "AI Exterior Design",
    description:
      "Transform your home facade, front porch, or entire exterior.",
    href: "/ai-exterior-design",
    cta: "Try Exterior Design →",
  },
  {
    title: "AI Floor Plan",
    description:
      "Upload a floor plan and visualize rooms in 2D, 3D, and 360°.",
    href: "/ai-floor-plan",
    cta: "Try Floor Plan →",
  },
];
