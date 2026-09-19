"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BEFORE_AFTER_INTERIOR,
  BEFORE_AFTER_EXTERIOR,
  BEFORE_AFTER_FLOOR_PLAN,
  type BeforeAfterPair,
} from "@/lib/catalog";
import { IconSparkles, IconArrowRight } from "@/components/shell/icons";
import { useTranslation } from "@/lib/i18n/context";

interface BeforeAfterProps {
  initialTab?: "interior" | "exterior" | "floor-plan";
  showTabs?: boolean;
  pairs?: BeforeAfterPair[];
}

export function BeforeAfter({
  initialTab = "interior",
  showTabs = true,
  pairs: customPairs,
}: BeforeAfterProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"interior" | "exterior" | "floor-plan">(initialTab);
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState(50);

  const getPairs = (): BeforeAfterPair[] => {
    if (customPairs && customPairs.length > 0) return customPairs;
    if (activeTab === "exterior") return BEFORE_AFTER_EXTERIOR;
    if (activeTab === "floor-plan") return BEFORE_AFTER_FLOOR_PLAN;
    return BEFORE_AFTER_INTERIOR;
  };

  const currentPairs = getPairs();
  const pair = currentPairs[index] || currentPairs[0];

  const getToolHref = () => {
    if (activeTab === "exterior") return "/ai-exterior-design";
    if (activeTab === "floor-plan") return "/ai-floor-plan";
    return "/ai-interior-design";
  };

  const handlePrev = () => {
    setIndex((prev) => (prev > 0 ? prev - 1 : currentPairs.length - 1));
    setPos(50);
  };

  const handleNext = () => {
    setIndex((prev) => (prev < currentPairs.length - 1 ? prev + 1 : 0));
    setPos(50);
  };

  const updatePosFromPointer = (clientX: number, currentTarget: HTMLElement) => {
    const rect = currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const newPos = Math.round((x / rect.width) * 100);
    setPos(newPos);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    updatePosFromPointer(e.clientX, e.currentTarget);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    updatePosFromPointer(e.clientX, e.currentTarget);
  };

  return (
    <div className="mx-auto max-w-5xl">
      {/* Category Tabs (Interior, Exterior, Floor Plan) */}
      {showTabs && (
        <div role="tablist" aria-label="Interior, Exterior, Floor Plan" className="mb-8 flex justify-center overflow-x-auto pb-1">
          <div className="flex min-w-max rounded-xl border border-border bg-card/60 p-1 backdrop-blur-xs">
            <button
              type="button"
              role="tab"
              id="comparison-tab-interior"
              aria-selected={activeTab === "interior"}
              onClick={() => {
                setActiveTab("interior");
                setIndex(0);
                setPos(50);
              }}
              className={`rounded-lg px-5 py-2 text-xs font-semibold whitespace-nowrap transition-all ${
                activeTab === "interior"
                   ? "bg-brand-primary text-white shadow-xs"
                   : "text-foreground/70 hover:text-foreground"
              }`}
            >
              {t.beforeAfter.interiorTab}
            </button>
            <button
              type="button"
              role="tab"
              id="comparison-tab-exterior"
              aria-selected={activeTab === "exterior"}
              onClick={() => {
                setActiveTab("exterior");
                setIndex(0);
                setPos(50);
              }}
              className={`rounded-lg px-5 py-2 text-xs font-semibold whitespace-nowrap transition-all ${
                activeTab === "exterior"
                   ? "bg-brand-primary text-white shadow-xs"
                   : "text-foreground/70 hover:text-foreground"
              }`}
            >
              {t.beforeAfter.exteriorTab}
            </button>
            <button
              type="button"
              role="tab"
              id="comparison-tab-floor-plan"
              aria-selected={activeTab === "floor-plan"}
              onClick={() => {
                setActiveTab("floor-plan");
                setIndex(0);
                setPos(50);
              }}
              className={`rounded-lg px-5 py-2 text-xs font-semibold whitespace-nowrap transition-all ${
                activeTab === "floor-plan"
                   ? "bg-brand-primary text-white shadow-xs"
                   : "text-foreground/70 hover:text-foreground"
              }`}
            >
              {t.beforeAfter.floorPlanTab}
            </button>
          </div>
        </div>
      )}

      {/* Comparison Slider Container with Side Arrows */}
      <div className="relative flex items-center justify-center">
        {/* Left Arrow Button */}
        {currentPairs.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-2 sm:-left-12 z-30 flex size-9 items-center justify-center rounded-full border border-border bg-card/90 text-foreground/80 shadow-md hover:bg-card hover:text-foreground backdrop-blur-xs transition"
            aria-label="Previous comparison"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}

        {/* The Slider Container */}
        <div
          id="before-after-slider"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          className="relative aspect-[16/10] md:aspect-[16/9] w-full select-none overflow-hidden rounded-3xl border border-border/80 bg-card shadow-md cursor-ew-resize touch-none"
          style={{ "--pos": `${pos}%` } as React.CSSProperties}
        >
          {/* Background checkerboard */}
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: "#f8fafc",
              backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, #f8fafc 0% 50%)",
              backgroundSize: "20px 20px",
            }}
          />

          {/* After image (underneath) */}
          <img
            src={pair.after}
            alt={`${pair.label} (after)`}
            className="absolute inset-0 h-full w-full object-cover pointer-events-none"
            draggable={false}
          />

          {/* Before image (clipped from right) */}
          <img
            src={pair.before}
            alt={`${pair.label} (before)`}
            className="absolute inset-0 h-full w-full object-cover pointer-events-none"
            style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
            draggable={false}
          />

          {/* Floating pill tags: Before (left) & After (right) */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-20 rounded-full border border-border/70 bg-card/90 px-3.5 py-1 text-xs font-semibold text-foreground shadow-xs backdrop-blur-md select-none">
            {t.beforeAfter.original}
          </div>
          <div className="pointer-events-none absolute bottom-4 right-4 z-20 rounded-full border border-border/70 bg-card/90 px-3.5 py-1 text-xs font-semibold text-foreground shadow-xs backdrop-blur-md select-none">
            {t.beforeAfter.aiRedesigned}
          </div>

          {/* Center Draggable Handle Bar */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-20 flex items-center justify-center"
            style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
          >
            <div className="h-full w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)]" />
            <div className="absolute flex h-9 w-9 items-center justify-center rounded-full bg-white text-foreground shadow-[0_2px_12px_rgba(0,0,0,0.25)] ring-1 ring-black/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-foreground/70"
              >
                <path d="m15 18-6-6 6-6" />
                <path d="m9 18 6-6-6-6" />
              </svg>
            </div>
          </div>

          {/* Range Input Overlay for Keyboard / Screen Readers */}
          <input
            type="range"
            min={0}
            max={100}
            value={pos}
            aria-label="Before After slider"
            onChange={(e) => setPos(Number(e.target.value))}
            className="absolute inset-0 m-0 h-full w-full cursor-ew-resize opacity-0 z-10 pointer-events-none"
          />
        </div>

        {/* Right Arrow Button */}
        {currentPairs.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-2 sm:-right-12 z-30 flex size-9 items-center justify-center rounded-full border border-border bg-card/90 text-foreground/80 shadow-md hover:bg-card hover:text-foreground backdrop-blur-xs transition"
            aria-label="Next comparison"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* Caption Card & Direct CTA */}
      <div className="mt-5 flex flex-col items-center gap-5">
        <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-copper">
              <IconSparkles className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-foreground">{pair.label}</h4>
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-semibold text-foreground/70 capitalize">
                  {activeTab.replace("-", " ")}
                </span>
              </div>
              <p className="mt-1 text-xs text-foreground/65 leading-relaxed max-w-2xl">
                {pair.prompt}
              </p>
            </div>
          </div>

          <Link
            href={getToolHref()}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand-primary px-4 text-xs font-bold text-white transition hover:bg-brand-accent shadow-xs active:translate-y-px"
          >
            <span>{t.beforeAfter.designThisStyle}</span>
            <IconArrowRight className="size-3.5" />
          </Link>
        </div>

        {/* Thumbnail Showcase Strip / Grid */}
        {currentPairs.length > 1 && (
          <div className="w-full">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[11px] font-bold text-foreground/60 uppercase tracking-wider">
                {t.beforeAfter.featuredSamples} ({currentPairs.length})
              </p>
              {/* Dot Indicators */}
              <div className="flex items-center gap-1.5">
                {currentPairs.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setIndex(i);
                      setPos(50);
                    }}
                    className={`h-1.5 rounded-full transition-all ${
                      i === index
                        ? "bg-brand-copper w-4"
                        : "bg-foreground/20 hover:bg-foreground/40 w-1.5"
                    }`}
                    aria-label={`Slide ${i + 1}`}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {currentPairs.map((p, i) => {
                const isSelected = i === index;
                return (
                  <button
                    key={p.label + i}
                    type="button"
                    onClick={() => {
                      setIndex(i);
                      setPos(50);
                    }}
                    className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-brand-primary ring-2 ring-brand-primary/30 shadow-xs"
                        : "border-border bg-card/60 hover:border-foreground/30 hover:bg-card"
                    }`}
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-black/5">
                      <img
                        src={p.after}
                        alt={p.label}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 rounded-full bg-brand-primary px-1.5 py-0.5 text-[9px] font-bold text-white shadow-xs">
                          {t.beforeAfter.viewing}
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="line-clamp-1 text-[11px] font-semibold text-foreground">
                        {p.label}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
