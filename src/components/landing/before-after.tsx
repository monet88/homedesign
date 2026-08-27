"use client";

import { useState } from "react";
import {
  BEFORE_AFTER_INTERIOR,
  BEFORE_AFTER_EXTERIOR,
  BEFORE_AFTER_FLOOR_PLAN,
  type BeforeAfterPair,
} from "@/lib/catalog";
import { IconSparkles } from "@/components/shell/icons";

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

  const handlePrev = () => {
    setIndex((prev) => (prev > 0 ? prev - 1 : currentPairs.length - 1));
    setPos(50);
  };

  const handleNext = () => {
    setIndex((prev) => (prev < currentPairs.length - 1 ? prev + 1 : 0));
    setPos(50);
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
              Interior
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
              Exterior
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
              Floor Plan
            </button>
          </div>
        </div>
      )}

      {/* Comparison Slider Container with Side Arrows */}
      <div className="relative flex items-center">
        {/* Left Arrow Button */}
        {currentPairs.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute -left-5 sm:-left-12 z-30 flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground/80 shadow-md hover:bg-black/5 hover:text-foreground"
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

        {/* The Slider */}
        <div
          id="before-after-slider"
          className="relative aspect-[16/10] md:aspect-[16/9] w-full select-none overflow-hidden rounded-3xl border border-border/80 bg-card shadow-md cursor-ew-resize"
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
            alt={`${pair.label} — after`}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />

          {/* Before image (clipped from right) */}
          <img
            src={pair.before}
            alt={`${pair.label} — before`}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
            draggable={false}
          />

          {/* Floating pill tags: Before (left) & After (right) */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-20 rounded-full border border-border/70 bg-card/90 px-3.5 py-1 text-xs font-semibold text-foreground shadow-xs backdrop-blur-md">
            Before
          </div>
          <div className="pointer-events-none absolute bottom-4 right-4 z-20 rounded-full border border-border/70 bg-card/90 px-3.5 py-1 text-xs font-semibold text-foreground shadow-xs backdrop-blur-md">
            After
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

          {/* Range Input Overlay for Drag / Touch / Keyboard */}
          <input
            type="range"
            min={0}
            max={100}
            value={pos}
            aria-label="Before After slider"
            onChange={(e) => setPos(Number(e.target.value))}
            className="absolute inset-0 m-0 h-full w-full cursor-ew-resize opacity-0 z-30"
          />
        </div>

        {/* Right Arrow Button */}
        {currentPairs.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute -right-5 sm:-right-12 z-30 flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground/80 shadow-md hover:bg-black/5 hover:text-foreground"
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

      {/* Caption Card Below Slider Matching Origin 1:1 */}
      <div className="mt-4 flex flex-col items-center">
        <div className="w-full rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-copper">
              <IconSparkles className="size-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">{pair.label}</h4>
              <p className="mt-0.5 text-xs text-foreground/65 leading-relaxed">
                {pair.prompt}
              </p>
            </div>
          </div>
        </div>

        {/* 5 Indicator Dots */}
        {currentPairs.length > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            {currentPairs.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setIndex(i);
                  setPos(50);
                }}
                className={`size-2 rounded-full transition-all ${
                  i === index
                    ? "bg-brand-copper w-5"
                    : "bg-foreground/20 hover:bg-foreground/40"
                }`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
