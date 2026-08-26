"use client";

import { useState } from "react";
import { BEFORE_AFTER_PAIRS } from "@/lib/catalog";

// Before/After comparison slider (DESIGN.md §4 Before/After; prototype
// before-after/index.html). Native `<input type=range>` + clip-path + CSS var
// `--pos` — no library (spec Implementation Decisions UI/Design). The 5
// "Show comparison 1..5" buttons switch the image pair; the range stays
// keyboard-, pointer- and touch-operable because it is a native input.
//
// The handle line is drawn at `--pos` (a percentage set on the wrapper) and
// the "after" image is clipped to the left of that position with
// `clip-path: inset(0 calc(100% - var(--pos)) 0 0)` — same technique as the
// prototype, so it works with keyboard arrows, mouse drag, and touch drag.


export function BeforeAfter() {
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState(50);
  const pair = BEFORE_AFTER_PAIRS[index];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {BEFORE_AFTER_PAIRS.map((p, i) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setIndex(i);
              setPos(50);
            }}
            aria-pressed={i === index}
            className={
              i === index
                ? "rounded-pill bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors"
                : "rounded-pill border border-ink/20 px-4 py-2 text-sm text-ink/80 transition-colors hover:border-ink/50"
            }
          >
            Show comparison {i + 1}
          </button>
        ))}
      </div>

      <div
        id="before-after-slider"
        className="relative mt-6 aspect-video w-full select-none overflow-hidden rounded-card bg-ink/10 shadow-sm"
        style={{ "--pos": `${pos}%` } as React.CSSProperties}
      >
        <img
          src={pair.before}
          alt={`${pair.label} — before`}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        <img
          src={pair.after}
          alt={`${pair.label} — after`}
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
      <p className="mt-3 text-center text-sm text-ink/60">
        {pair.label}
      </p>
    </div>
  );
}
