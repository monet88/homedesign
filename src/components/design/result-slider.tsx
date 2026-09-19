"use client";

import { useState } from "react";

// Result Before/After slider (ticket #14).
// Reuses the landing slider technique: native <input type=range> + clip-path + CSS var --pos.
// The 5 "Show comparison" buttons jump to preset slider positions so the user can
// quickly compare specific areas of the image.

const MODES = [
  { pos: 0, label: "📸 Ảnh Hiện Trạng", short: "Hiện Trạng" },
  { pos: 50, label: "↔ So Sánh Kéo Kính (50/50)", short: "So Sánh" },
  { pos: 100, label: "✨ Phối Cảnh AI", short: "Thiết Kế AI" },
];

interface ResultSliderProps {
  beforeSrc: string;
  afterSrc: string;
  label?: string;
}

export function ResultSlider({ beforeSrc, afterSrc, label }: ResultSliderProps) {
  const [pos, setPos] = useState(50);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    <div className="mx-auto max-w-4xl">
      {/* Segmented Control Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex rounded-xl bg-muted/60 p-1 border border-border/80 shadow-xs">
          {MODES.map((mode) => (
            <button
              key={mode.pos}
              type="button"
              onClick={() => setPos(mode.pos)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                pos === mode.pos
                  ? "bg-card text-foreground shadow-xs border border-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/5"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Fullscreen view button */}
        <button
          type="button"
          onClick={() => setIsFullscreen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/80 transition-all shadow-xs"
          title="Phóng to toàn màn hình"
        >
          <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          <span>Xem Toàn Màn Hình</span>
        </button>
      </div>

      {/* Main Slider Canvas */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        className="relative aspect-video w-full select-none overflow-hidden rounded-2xl bg-black/5 border border-border/60 shadow-lg cursor-ew-resize touch-none"
        style={{ "--pos": `${pos}%` } as React.CSSProperties}
      >
        {/* Before Image (Left/Bottom) */}
        <img
          src={beforeSrc}
          alt="Ảnh hiện trạng gốc"
          className="absolute inset-0 h-full w-full object-cover pointer-events-none"
          draggable={false}
        />

        {/* After Image (Right/Top clip) */}
        <img
          src={afterSrc}
          alt="Bản phối cảnh AI"
          className="absolute inset-0 h-full w-full object-cover pointer-events-none"
          style={{ clipPath: "inset(0 calc(100% - var(--pos)) 0 0)" }}
          draggable={false}
        />

        {/* Corner Badges */}
        <div className="absolute top-3 left-3 pointer-events-none rounded-lg bg-black/60 backdrop-blur-md px-2.5 py-1 text-[11px] font-bold text-white shadow-md border border-white/10">
          Hiện Trạng (Trước)
        </div>
        <div className="absolute top-3 right-3 pointer-events-none rounded-lg bg-brand-primary/85 backdrop-blur-md px-2.5 py-1 text-[11px] font-bold text-white shadow-md border border-white/20">
          Phối Cảnh AI (Sau)
        </div>

        {/* Divider line & handle */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-10"
          style={{ left: "var(--pos)" }}
        >
          <div className="h-full w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.7)]" />
          <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-stone-900 font-bold shadow-[0_2px_12px_rgba(0,0,0,0.35)] border-2 border-brand-primary">
            <span className="text-xs select-none">↔</span>
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          aria-label="Before After comparison slider (Kéo thanh trượt so sánh trước sau)"
          onChange={(e) => setPos(Number(e.target.value))}
          className="absolute inset-0 m-0 h-full w-full cursor-ew-resize opacity-0 pointer-events-none"
        />
      </div>

      {label && <p className="mt-3 text-center text-xs text-muted-foreground">{label}</p>}

      {/* Lightbox Modal */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
          onClick={() => setIsFullscreen(false)}
        >
          <div
            className="relative max-h-[90vh] max-w-5xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -top-12 right-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white hover:bg-white/30"
              >
                ✕ Đóng (ESC)
              </button>
            </div>
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl shadow-2xl border border-white/10">
              <img
                src={pos >= 50 ? afterSrc : beforeSrc}
                alt="Chi tiết kích thước lớn"
                className="h-full w-full object-contain bg-stone-950"
              />
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-xs text-white backdrop-blur-md">
                Đang xem: <strong>{pos >= 50 ? "Bản phối cảnh AI" : "Ảnh hiện trạng gốc"}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
