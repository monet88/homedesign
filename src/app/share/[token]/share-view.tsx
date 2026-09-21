"use client";

import { useState } from "react";
import Link from "next/link";
import type { ShareView, ShareViewAsset } from "@/lib/library/share";
import { PitchDeckModal } from "@/components/design/pitch-deck-modal";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ShareViewPanel({
  token,
  view,
}: {
  token: string;
  view: ShareView | null;
}) {
  const [copied, setCopied] = useState(false);
  const [activeAssetIndex, setActiveAssetIndex] = useState(0);
  const [sliderPos, setSliderPos] = useState(50);
  const [isComparing, setIsComparing] = useState(true);
  const [pitchDeckOpen, setPitchDeckOpen] = useState(false);

  if (!view) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-border/40 text-foreground/50">
          <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Liên kết không khả dụng</h1>
        <p className="mt-2 text-sm text-foreground/70">
          Liên kết chia sẻ này có thể đã hết hạn hoặc đã được chủ sở hữu thu hồi.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-primary/90"
          >
            Trở về trang chủ HomeDesign
          </Link>
        </div>
      </main>
    );
  }

  const selectedAsset: ShareViewAsset | undefined = view.assets[activeAssetIndex] ?? view.assets[0];
  const sourceAsset = view.sourceAsset;
  const hasComparison = Boolean(sourceAsset && selectedAsset);

  const beforeUrl = sourceAsset
    ? `/api/share/${encodeURIComponent(token)}/assets/${encodeURIComponent(sourceAsset.id)}`
    : null;
  const afterUrl = selectedAsset
    ? `/api/share/${encodeURIComponent(token)}/assets/${encodeURIComponent(selectedAsset.id)}`
    : null;

  async function handleCopyLink() {
    if (typeof window === "undefined") return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = window.location.href;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  const ctaHref =
    view.kind === "floor-plan"
      ? "/ai-floor-plan?ref=share"
      : view.kind === "exterior"
      ? "/ai-exterior-design?ref=share"
      : "/ai-virtual-staging?ref=share";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* 1. Header Bar with Project Metadata & Share Actions */}
      <header className="mb-6 flex flex-col gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-foreground/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
              Shared project
            </span>
            <span className="rounded-md bg-brand-primary/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-primary">
              {view.kind.replace("-", " ")} Design
            </span>
            <span className="text-xs text-foreground/50">
              Cập nhật {formatDate(view.updatedAt)}
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {view.name}
          </h1>
        </div>

        {/* Quick Share Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {afterUrl && (
            <a
              href={afterUrl}
              download={`${view.name.replace(/\s+/g, "_")}_design.png`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-xs transition hover:border-brand-primary/50 hover:bg-card/80"
              title="Tải ảnh thiết kế về máy"
            >
              <svg className="size-4 text-foreground/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3h-10a3 3 0 00-3-3m0 0l-4-4m4 4l4-4m-4 4V4" />
              </svg>
              <span>Tải ảnh HD</span>
            </a>
          )}

          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-xs transition hover:border-brand-primary/50 hover:bg-card/80"
          >
            {copied ? (
              <>
                <svg className="size-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-emerald-600 font-bold">Đã sao chép link!</span>
              </>
            ) : (
              <>
                <svg className="size-4 text-foreground/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Sao chép link</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setPitchDeckOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-primary/40 bg-brand-primary/10 px-3.5 py-2 text-xs font-bold text-brand-primary shadow-xs transition hover:bg-brand-primary/20"
            title="Xuất hồ sơ thuyết minh PDF A4 Landscape"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Hồ Sơ PDF</span>
          </button>

          <Link
            href={ctaHref}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-brand-primary/90"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Tự thiết kế phòng của bạn</span>
          </Link>
        </div>
      </header>

      {/* 2. Sharing Privacy Notice (ADR 0009 / Ticket #09) */}
      <aside
        className="mb-6 rounded-2xl border border-border/80 bg-card/60 px-4 py-3 text-xs leading-relaxed text-foreground/70"
        role="note"
        aria-label="Sharing privacy notice"
      >
        Read-only share — not DRM. Anyone viewing these images can save, screenshot, or copy them using
        normal browser tools. This view intentionally omits a download button, but that is not copy
        protection.
      </aside>

      {/* 3. Main Interactive Showcase (Before / After Split Slider) */}
      {view.assets.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-foreground/60">
          Chưa có hình ảnh nào được chọn để chia sẻ cho dự án này.
        </div>
      ) : hasComparison && isComparing && beforeUrl && afterUrl ? (
        <div className="mb-6">
          {/* Comparison Controls */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-card p-1 text-xs">
              <button
                type="button"
                onClick={() => setSliderPos(0)}
                aria-pressed={sliderPos === 0}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  sliderPos === 0 ? "bg-brand-primary text-white" : "text-foreground/70 hover:text-foreground"
                }`}
              >
                100% Ảnh gốc
              </button>
              <button
                type="button"
                onClick={() => setSliderPos(50)}
                aria-pressed={sliderPos === 50}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  sliderPos === 50 ? "bg-brand-primary text-white" : "text-foreground/70 hover:text-foreground"
                }`}
              >
                So sánh 50 / 50
              </button>
              <button
                type="button"
                onClick={() => setSliderPos(100)}
                aria-pressed={sliderPos === 100}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  sliderPos === 100 ? "bg-brand-primary text-white" : "text-foreground/70 hover:text-foreground"
                }`}
              >
                100% Thiết kế mới
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsComparing(false)}
              className="text-xs font-semibold text-brand-primary hover:underline"
            >
              Chuyển sang chế độ xem từng ảnh
            </button>
          </div>

          {/* Interactive Split Slider */}
          <div
            className="relative aspect-video w-full select-none overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
            style={{ "--pos": `${sliderPos}%`, touchAction: "pan-y" } as React.CSSProperties}
          >
            {/* Before (Original) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={beforeUrl}
              alt="Ảnh gốc trước thiết kế"
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
            <div className="absolute bottom-3 left-3 z-10 rounded-md bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-xs">
              BEFORE (ẢNH GỐC)
            </div>

            {/* After (AI Staged / Redesigned) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={afterUrl}
              alt="Ảnh thiết kế sau khi AI xử lý"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ clipPath: "inset(0 calc(100% - var(--pos)) 0 0)" }}
              draggable={false}
            />
            <div
              className="absolute bottom-3 right-3 z-10 rounded-md bg-brand-primary/90 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-xs"
            >
              AFTER (AI THIẾT KẾ)
            </div>

            {/* Slider Divider & Handle */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-20"
              style={{ left: "var(--pos)" }}
            >
              <div className="h-full w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)]" />
              <div className="absolute left-1/2 top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-brand-primary bg-white text-xs font-extrabold text-brand-primary shadow-lg">
                ↔
              </div>
            </div>

            {/* Native Slider Input */}
            <input
              type="range"
              min={0}
              max={100}
              value={sliderPos}
              aria-label="Thanh trượt so sánh Before After"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={sliderPos}
              onChange={(e) => setSliderPos(Number(e.target.value))}
              className="absolute inset-0 m-0 h-full w-full cursor-ew-resize opacity-0 z-30"
            />
          </div>
        </div>
      ) : (
        <div className="mb-6">
          {hasComparison && (
            <div className="mb-3 text-right">
              <button
                type="button"
                onClick={() => setIsComparing(true)}
                className="text-xs font-semibold text-brand-primary hover:underline"
              >
                Bật thanh trượt so sánh Before / After
              </button>
            </div>
          )}
          {afterUrl && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={afterUrl}
                alt="Thiết kế chi tiết"
                className="aspect-video w-full object-cover"
              />
            </div>
          )}
        </div>
      )}

      {/* 3. Multi-Variation Selector (nếu dự án có nhiều ảnh output) */}
      {view.assets.length > 1 && (
        <div className="mb-8">
          <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-foreground/70">
            Các phương án thiết kế ({view.assets.length} biến thể)
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {view.assets.map((asset, idx) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => {
                  setActiveAssetIndex(idx);
                  setIsComparing(true);
                }}
                className={`group relative overflow-hidden rounded-xl border text-left transition ${
                  activeAssetIndex === idx
                    ? "border-brand-primary ring-2 ring-brand-primary/40 shadow-sm"
                    : "border-border/70 hover:border-brand-primary/50"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/share/${encodeURIComponent(token)}/assets/${encodeURIComponent(asset.id)}`}
                  alt={`Phương án ${idx + 1}`}
                  className="aspect-[4/3] w-full object-cover transition group-hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-white">
                  <span className="text-[11px] font-bold">Phương án #{idx + 1}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. Product-Led Viral Conversion Card (The Core Growth Engine) */}
      <section className="mb-8 overflow-hidden rounded-3xl border border-brand-primary/20 bg-gradient-to-br from-brand-primary/10 via-card to-brand-primary/5 p-6 sm:p-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary/20 px-3 py-1 text-[11px] font-bold text-brand-primary">
              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              HomeDesign AI Studio
            </span>
            <h2 className="mt-3 text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
              Bạn muốn biến đổi căn phòng của mình đẹp như thế này?
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-foreground/70 sm:text-sm">
              Chỉ cần tải lên 1 bức ảnh chụp phòng hiện tại (hoặc phòng trống), AI sẽ tự động decor
              full nội thất sang trọng hoặc thiết kế lại toàn bộ không gian trong 30 giây.
            </p>
            <div className="mt-3 flex items-center gap-4 text-xs font-semibold text-foreground/80">
              <span className="flex items-center gap-1 text-emerald-600">
                ✓ Miễn phí 10 Credits ban đầu
              </span>
              <span className="flex items-center gap-1 text-emerald-600">
                ✓ Không cần cài đặt phức tạp
              </span>
            </div>
          </div>

          <div className="w-full sm:w-auto">
            <Link
              href={ctaHref}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary px-6 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-brand-primary/90 hover:shadow-lg sm:w-auto"
            >
              <span>Thử nghiệm miễn phí ngay</span>
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* 5. Footer Attribution & Privacy Notice */}
      <footer className="flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-6 text-center text-xs text-foreground/50 sm:flex-row sm:text-left">
        <div>
          <span>Bản xem chia sẻ bảo mật (Unlisted Read-only) · </span>
          <span className="font-medium text-foreground/70">HomeDesign AI Clone</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/privacy-policy" className="hover:text-foreground">
            Bảo mật
          </Link>
          <Link href="/terms-of-service" className="hover:text-foreground">
            Điều khoản
          </Link>
          <Link href="/" className="font-semibold text-brand-primary hover:underline">
            design.7app.online
          </Link>
        </div>
      </footer>
      {/* 6. B2B Pitch Deck PDF Modal */}
      <PitchDeckModal
        open={pitchDeckOpen}
        onClose={() => setPitchDeckOpen(false)}
        beforeSrc={beforeUrl}
        afterSrc={afterUrl}
        defaultProjectName={view.name}
        defaultRoomType={view.kind}
      />
    </main>
  );
}
