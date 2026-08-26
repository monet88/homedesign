"use client";

import { useState } from "react";

// Result Before/After slider (ticket #14).
// Reuses the landing slider technique: native <input type=range> + clip-path + CSS var --pos.
// The 5 "Show comparison" buttons jump to preset slider positions so the user can
// quickly compare specific areas of the image.

const COMPARISON_POSITIONS = [0, 25, 50, 75, 100];

interface ResultSliderProps {
  beforeSrc: string;
  afterSrc: string;
  label?: string;
}

export function ResultSlider({ beforeSrc, afterSrc, label }: ResultSliderProps) {
  const [pos, setPos] = useState(50);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {COMPARISON_POSITIONS.map((p, i) => (
          <button
            key={p}
            type="button"
            onClick={() => setPos(p)}
            aria-pressed={pos === p}
            className={
              pos === p
                ? "rounded-pill bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors"
                : "rounded-pill border border-ink/20 px-4 py-2 text-sm text-ink/80 transition-colors hover:border-ink/50"
            }
          >
            Show comparison {i + 1}
          </button>
        ))}
      </div>

      <div
        className="relative mt-6 aspect-video w-full select-none overflow-hidden rounded-card bg-ink/10 shadow-sm"
        style={{ "--pos": `${pos}%` } as React.CSSProperties}
      >
        <img
          src={beforeSrc}
          alt="Original"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        <img
          src={afterSrc}
          alt="Generated design"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: "inset(0 calc(100% - var(--pos)) 0 0)" }}
          draggable={false}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0"
          style={{ left: "var(--pos)" }}
        >
          <div className="h-full w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.4)]" />
          <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-sm font-bold text-ink shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
            ↔
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          aria-label="Before After slider"
          onChange={(e) => setPos(Number(e.target.value))}
          className="absolute inset-0 m-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>

      {label && <p className="mt-3 text-center text-sm text-ink/60">{label}</p>}
    </div>
  );
}
