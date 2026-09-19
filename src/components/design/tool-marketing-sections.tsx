"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BeforeAfter } from "@/components/landing/before-after";
import { CatalogPreviewModal } from "@/components/landing/catalog-preview-modal";
import { PricingSection } from "@/components/landing/pricing-section";
import {
  POPULAR_STYLES,
  IDEAS,
  EXTERIOR_STYLES,
  EXTERIOR_AREAS,
  BEFORE_AFTER_INTERIOR,
  BEFORE_AFTER_EXTERIOR,
  FAQ_INTERIOR,
  FAQ_EXTERIOR,
  FAQ_FLOOR_PLAN,
  buildCatalogPresetHref,
  type CatalogItem,
  type FaqItem,
} from "@/lib/catalog";
import {
  IconSparkles,
  IconArrowRight,
  IconImagePlus,
  IconChevronDown,
} from "@/components/shell/icons";
import { useTranslation } from "@/lib/i18n/context";

interface ToolMarketingSectionsProps {
  scene: "interior" | "exterior" | "floor-plan";
  onSelectPreset?: (preset: NonNullable<CatalogItem["preset"]>) => void;
}

const STYLE_SWATCHES: Record<string, string[]> = {
  "Modern Warm": ["#d8cbbb", "#9e8b7d", "#4a423a", "#786553", "#2c2621"],
  "Japandi": ["#ede8df", "#d3c9b8", "#a89b87", "#6e6252", "#23211e"],
  "Scandinavian": ["#ffffff", "#f0ebe1", "#b8c0c2", "#667279", "#21272b"],
  "Minimal": ["#f5f5f5", "#d4d4d4", "#a3a3a3", "#525252", "#171717"],
  "Classic Warm": ["#f7efe1", "#dfceb4", "#b0946d", "#7c5c36", "#3b2613"],
  "Industrial Loft": ["#9ca3af", "#6b7280", "#4b5563", "#374151", "#1f2937"],
  "Organic Modern": ["#f4ede2", "#d8c7b0", "#a6957c", "#5c503e", "#2e271c"],
  "Wabi-Sabi": ["#e8e1d5", "#c5baa7", "#988c77", "#5c5241", "#2b251c"],
  "Mediterranean": ["#fef3c7", "#fde68a", "#d97706", "#b45309", "#78350f"],
  "Mid-Century": ["#fed7aa", "#fb923c", "#ea580c", "#9a3412", "#431407"],
  "French Vintage": ["#fdf2f8", "#fbcfe8", "#f472b6", "#db2777", "#831843"],
  "Luxury Wood": ["#fed7aa", "#d97706", "#92400e", "#451a03", "#1c0a00"],
};

const EXTERIOR_CAPABILITIES = [
  {
    title: "Redesign & Edit Modes",
    description:
      "Switch between a full exterior redesign or a targeted local edit. Type what you want to change and the AI updates only that area.",
    icon: "🎨",
  },
  {
    title: "Structure-Aware Generation",
    description:
      "The AI keeps your roofline, windows, and door openings intact while updating siding, roofing, trim, and landscaping.",
    icon: "🏠",
  },
  {
    title: "Area-Specific Design",
    description:
      "Generate designs for any outdoor area — facade, entrance, porch, backyard, driveway, or garden — not just the front view.",
    icon: "📍",
  },
  {
    title: "Model Selection",
    description:
      "Pick the right AI model for your render, from fast everyday output to higher-quality, detail-rich exterior designs.",
    icon: "📷",
  },
  {
    title: "Flexible Aspect Ratios",
    description:
      "Output in 4:3, 16:9, 1:1, 3:4, or 9:16 to match your source photo and wherever you plan to share it.",
    icon: "📐",
  },
  {
    title: "Side-by-Side Comparison",
    description:
      "Inspect your before and after with an interactive slider or jump straight to full-resolution export.",
    icon: "↔️",
  },
  {
    title: "B2B Export Ready",
    description:
      "Generate clean client-facing presentations and design packs straight from the tool output.",
    icon: "📄",
  },
];

export function ToolMarketingSections({
  scene,
  onSelectPreset,
}: ToolMarketingSectionsProps) {
  const { lang } = useTranslation();
  const isVi = lang === "vi";
  const [previewItem, setPreviewItem] = useState<CatalogItem | null>(null);
  const isInterior = scene === "interior";
  const isExterior = scene === "exterior";
  const isFloorPlan = scene === "floor-plan";

  const styles = isInterior ? POPULAR_STYLES : EXTERIOR_STYLES;
  const ideas = isInterior ? IDEAS : EXTERIOR_AREAS;
  const beforeAfterPairs = isInterior ? BEFORE_AFTER_INTERIOR : BEFORE_AFTER_EXTERIOR;
  const faqs: FaqItem[] = isInterior
    ? FAQ_INTERIOR
    : isExterior
    ? FAQ_EXTERIOR
    : FAQ_FLOOR_PLAN;

  const toolName = isInterior
    ? (isVi ? "AI Thiết Kế Nội Thất" : "AI Interior Design")
    : isExterior
    ? (isVi ? "AI Thiết Kế Ngoại Thất" : "AI Exterior Design")
    : (isVi ? "AI Mặt Bằng 2D/3D" : "AI Floor Plan");

  const scrollToGenerator = () => {
    const el = document.getElementById("generator-card");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-28 py-16">
      {/* 1. Popular Styles Grid with 5 Color Swatches & Use Style Action */}
      {!isFloorPlan && (
        <section id="popular-styles" className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 w-full">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {isVi
                ? (isInterior ? "Phong Cách Nội Thất Thịnh Hành" : "Phong Cách Ngoại Thất Thịnh Hành")
                : (isInterior ? "Popular Styles" : "Popular AI Exterior Design Styles")}
            </h2>
            <Link
              href="#popular-styles"
              className="flex items-center gap-1 text-xs font-semibold text-brand-copper hover:underline"
            >
              <span>{isVi ? "Xem tất cả phong cách" : "View all styles"}</span>
              <IconArrowRight className="size-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {styles.slice(0, 10).map((item) => {
              const swatches = STYLE_SWATCHES[item.title] || [
                "#e5e0d8",
                "#baa898",
                "#8c7a6b",
                "#5c4d40",
                "#2c241d",
              ];
              return (
                <div
                  key={item.title}
                  className="card group flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-3 shadow-2xs transition-all hover:shadow-md"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black/5 mb-3">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>

                  <div>
                    <h3 className="truncate text-sm font-bold text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs text-foreground/65 min-h-[2rem]">
                      {item.description || "Curated architecture & interior design aesthetics."}
                    </p>

                    {/* 5 Color dots */}
                    <div className="my-2.5 flex items-center gap-1.5">
                      {swatches.map((c, i) => (
                        <span
                          key={i}
                          className="size-2.5 rounded-full border border-black/10"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>

                    {/* Use Style CTA */}
                    <button
                      type="button"
                      onClick={() => {
                        if (onSelectPreset && item.preset) {
                          onSelectPreset(item.preset);
                        }
                        scrollToGenerator();
                      }}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-border bg-card/80 py-1.5 text-xs font-semibold text-foreground/85 transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                      <IconSparkles className="size-3 text-brand-copper" />
                      <span>{isVi ? "Sử dụng phong cách" : item.useLabel}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      className="actions mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-border/80 bg-background/60 py-1.5 text-xs font-semibold text-foreground/70 transition-colors hover:bg-background hover:text-foreground"
                    >
                      <IconImagePlus className="size-3" />
                      <span>{isVi ? "Xem trước mẫu" : item.previewLabel}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 2. Ideas for Every Room / Area Grid */}
      {!isFloorPlan && (
        <section id="ideas" className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 w-full">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {isInterior ? "Ideas for Every Room" : "AI Exterior Design Ideas for Every Area"}
            </h2>
            <Link
              href="#ideas"
              className="flex items-center gap-1 text-xs font-semibold text-brand-copper hover:underline"
            >
              <span>View all ideas</span>
              <IconArrowRight className="size-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {ideas.slice(0, 10).map((item) => (
              <div
                key={item.title}
                className="card group flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-3 shadow-2xs transition-all hover:shadow-md"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black/5 mb-3">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>

                <div>
                  <h3 className="truncate text-sm font-bold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs text-foreground/65 min-h-[2rem]">
                    {item.description || "Specific design direction for this area."}
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      if (onSelectPreset && item.preset) {
                        onSelectPreset(item.preset);
                      }
                      scrollToGenerator();
                    }}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-border bg-card/80 py-1.5 text-xs font-semibold text-foreground/85 transition-colors hover:bg-black/5 hover:text-foreground"
                  >
                    <IconSparkles className="size-3 text-brand-copper" />
                    <span>{item.useLabel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewItem(item)}
                    className="actions mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-border/80 bg-background/60 py-1.5 text-xs font-semibold text-foreground/70 transition-colors hover:bg-background hover:text-foreground"
                  >
                    <IconImagePlus className="size-3" />
                    <span>Preview area</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Before & After Showcase */}
      <section id="before-after" className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="mx-auto max-w-2xl text-center mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {toolName} Before &amp; After
          </h2>
          <p className="mt-2 text-sm text-foreground/70">
            Swipe to explore more {toolName} transformations
          </p>
        </div>

        <BeforeAfter
          initialTab={isInterior ? "interior" : isExterior ? "exterior" : "floor-plan"}
          showTabs={false}
          pairs={beforeAfterPairs}
        />
      </section>

      {/* 4. Powerful AI Exterior Design Capabilities (only for Exterior page) */}
      {isExterior && (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 w-full">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Powerful AI Exterior Design Capabilities
            </h2>
            <p className="mt-2 text-sm text-foreground/70">
              Experience the future of exterior design with advanced AI that transforms your house exterior instantly.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {EXTERIOR_CAPABILITIES.map((cap) => (
              <div
                key={cap.title}
                className="flex flex-col rounded-2xl border border-border/80 bg-card p-6 shadow-2xs transition-all hover:shadow-md"
              >
                <span className="text-2xl mb-4">{cap.icon}</span>
                <h3 className="text-base font-semibold text-foreground">
                  {cap.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-foreground/75">
                  {cap.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. How to use (3 Steps) with 2-Column Split */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            How to use {toolName}
          </h2>
          <p className="mt-2 text-sm text-foreground/70">
            Three simple steps to start with {toolName} and redesign any space
          </p>
        </div>

        <div className="grid gap-8 rounded-3xl border border-border bg-card p-6 sm:p-10 lg:grid-cols-[1.2fr_1.8fr] items-center shadow-xs">
          {/* Left Preview illustration / box */}
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black/5 border border-border/60">
            <Image
              src={
                isExterior
                  ? "/ai-exterior-design/examples/modern-facade.webp"
                  : "/landing/hero-room-light.webp"
              }
              alt="How to use preview"
              fill
              className="object-cover"
            />
          </div>

          {/* Right 3 Steps */}
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">
                1
              </span>
              <div>
                <h4 className="text-sm font-bold text-foreground">
                  {isExterior ? "Upload a house photo" : "Upload a photo"}
                </h4>
                <p className="mt-1 text-xs text-foreground/70 leading-relaxed">
                  {isExterior
                    ? "Upload a clear photo of your facade, yard, or porch. We read the roofline and structure for your AI exterior design."
                    : "Upload a clear photo of your room. We will read the layout and structure for your AI interior design."}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">
                2
              </span>
              <div>
                <h4 className="text-sm font-bold text-foreground">
                  {isExterior ? "Pick an exterior style" : "Choose a style"}
                </h4>
                <p className="mt-1 text-xs text-foreground/70 leading-relaxed">
                  {isExterior
                    ? "Choose a style, palette, and materials to guide your AI exterior design."
                    : "Pick a style, adjust colors, and add notes to guide your AI interior design. Decide what stays and what changes."}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">
                3
              </span>
              <div>
                <h4 className="text-sm font-bold text-foreground">
                  Generate and compare
                </h4>
                <p className="mt-1 text-xs text-foreground/70 leading-relaxed">
                  Preview your {toolName} and refine it until it feels right.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Pricing Section */}
      <PricingSection />

      {/* 7. Frequently Asked Questions */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Frequently Asked Questions About {toolName}
          </h2>
          <p className="mt-2 text-xs text-foreground/60">
            Common questions about {toolName}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card divide-y divide-border/60 overflow-hidden shadow-xs">
          {faqs.map((faq) => (
            <details key={faq.question} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-xs sm:text-sm text-foreground hover:text-brand-copper transition-colors">
                <span>{faq.question}</span>
                <span className="ml-4 transition-transform group-open:rotate-180">
                  <IconChevronDown className="size-4" />
                </span>
              </summary>
              <p className="mt-3 text-xs leading-relaxed text-foreground/75">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* 8. Bottom CTA Banner (2-Column Split Card Matching Origin 1:1) */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid overflow-hidden rounded-3xl border border-border bg-[#0f382c] shadow-lg lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col justify-center p-8 sm:p-14 text-white">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Create Your First<br />{toolName}
            </h2>
            <p className="mt-4 max-w-md text-sm text-white/80 leading-relaxed">
              Upload a photo and explore endless {toolName.toLowerCase()} ideas.
            </p>
            <div className="mt-8">
              <button
                type="button"
                onClick={scrollToGenerator}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-6 text-xs font-bold text-[#0f382c] shadow-md transition-all hover:bg-white/90 active:translate-y-px"
              >
                <IconImagePlus className="size-4" />
                <span>{isExterior ? "Design My Home Exterior" : "Design My Room"}</span>
              </button>
            </div>
          </div>

          <div className="relative min-h-[260px] w-full overflow-hidden bg-black/10 lg:min-h-full">
            <Image
              src={
                isExterior
                  ? "/ai-exterior-design/examples/modern-facade.webp"
                  : "/landing/hero-room-light.webp"
              }
              alt="CTA preview"
              fill
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {previewItem && (
        <CatalogPreviewModal
          image={previewItem.image}
          title={previewItem.title}
          open={true}
          onClose={() => setPreviewItem(null)}
          useHref={buildCatalogPresetHref(previewItem)}
          useLabel={previewItem.useLabel}
        />
      )}
    </div>
  );
}
