"use client";

import { useState, useEffect } from "react";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import type { StudioBranding } from "@/lib/branding/types";

export interface PitchDeckProps {
  open: boolean;
  onClose: () => void;
  beforeSrc?: string | null;
  afterSrc?: string | null;
  defaultProjectName?: string;
  defaultStyle?: string;
  defaultRoomType?: string;
  defaultPalette?: string;
}

export function PitchDeckModal({
  open,
  onClose,
  beforeSrc = "",
  afterSrc = "",
  defaultProjectName = "Luxury Residence Redesign",
  defaultStyle = "Scandinavian Warm",
  defaultRoomType = "Living Room",
  defaultPalette = "Warm Woods & Ivory White",
}: PitchDeckProps) {
  const [projectName, setProjectName] = useState(defaultProjectName);
  const [clientName, setClientName] = useState("Kính gửi Quý Khách Hàng");
  const [architectName, setArchitectName] = useState("HomeDesign Architecture Studio");
  const [style, setStyle] = useState(defaultStyle);
  const [roomType, setRoomType] = useState(defaultRoomType);
  const [palette, setPalette] = useState(defaultPalette);
  const [designNotes, setDesignNotes] = useState(
    "Phương án tối ưu ánh sáng tự nhiên kết hợp hệ tủ gỗ sồi tự nhiên, đá mable mờ và ánh sáng gián tiếp 3000K ấm cúng."
  );

  const { activeWorkspace } = useWorkspace();
  const [branding, setBranding] = useState<StudioBranding | null>(null);

  useEffect(() => {
    if (!activeWorkspace?.id) return;
    fetch(`/api/workspaces/${activeWorkspace.id}/branding`)
      .then((r) => r.json())
      .then((json: any) => {
        if (json.code === 0 && json.data?.branding) {
          const b: StudioBranding = json.data.branding;
          setBranding(b);
          if (b.brandName) {
            setArchitectName(b.brandName);
          }
        }
      })
      .catch(() => {});
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm print:p-0 print:bg-white"
    >
      {/* Modal Container */}
      <div className="relative flex max-h-[95vh] w-full max-w-5xl flex-col rounded-3xl border border-border bg-card shadow-2xl overflow-hidden print:border-none print:shadow-none print:max-h-none print:w-full">
        {/* Header Bar - Hidden when printing */}
        <div className="flex items-center justify-between border-b border-border/80 px-6 py-4 bg-muted/30 print:hidden">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Hồ Sơ Thuyết Minh Thiết Kế B2B (PDF Pitch Deck)
              </h2>
              <p className="text-xs text-foreground/60">
                Xuất file PDF A4 Landscape chuẩn Architectural Digest cho khách hàng
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-accent transition-all"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>In / Tải PDF (Print to PDF)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border bg-card p-2 text-foreground/70 hover:bg-muted transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-6 space-y-6 print:p-0 print:overflow-visible">
          {/* Quick Settings Form - Hidden when printing */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/80 bg-background/50 p-4 text-xs sm:grid-cols-3 print:hidden">
            <div>
              <label className="font-semibold text-foreground/70">Tên Dự Án</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-1.5 text-foreground focus:border-brand-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-foreground/70">Khách Hàng</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-1.5 text-foreground focus:border-brand-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-foreground/70">Đơn Vị Thiết Kế</label>
              <input
                type="text"
                value={architectName}
                onChange={(e) => setArchitectName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-1.5 text-foreground focus:border-brand-primary focus:outline-none"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="font-semibold text-foreground/70">Ghi Chú & Ý Tưởng Thiết Kế</label>
              <input
                type="text"
                value={designNotes}
                onChange={(e) => setDesignNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-1.5 text-foreground focus:border-brand-primary focus:outline-none"
              />
            </div>
          </div>

          {/* A4 Landscape Document Page for Printing / PDF */}
          <div
            id="pitch-deck-print-area"
            className="mx-auto aspect-[1.414/1] w-full max-w-4xl rounded-2xl border border-border/80 bg-[#fdfcf9] p-8 text-ink shadow-sm print:m-0 print:h-screen print:w-screen print:rounded-none print:border-none print:shadow-none print:p-8"
          >
            {/* Header Document */}
            <div className="flex items-start justify-between border-b-2 border-brand-primary/30 pb-4">
              <div>
                {branding?.brandLogoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={branding.brandLogoUrl}
                    alt="Logo Studio"
                    className="h-9 mb-2 object-contain"
                  />
                )}
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary">
                  ARCHITECTURAL DESIGN PROPOSAL • HỒ SƠ PHƯƠNG ÁN
                </span>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-ink sm:text-3xl">
                  {projectName}
                </h1>
                <p className="text-xs text-ink/70">
                  Chủ đầu tư: <strong>{clientName}</strong> • Thiết kế: <strong>{architectName}</strong>
                </p>
              </div>

              <div className="text-right">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary/10 px-3 py-1 text-[11px] font-bold text-brand-primary">
                  ★ Architectural Digest Standard
                </div>
                {branding?.brandTagline && (
                  <p className="mt-1 text-[11px] font-semibold text-brand-primary/80">
                    {branding.brandTagline}
                  </p>
                )}
                <p className="mt-0.5 text-[11px] text-ink/50">
                  {new Date().toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>

            {/* Main Visuals: 2-Column Comparison */}
            <div className="mt-6 grid grid-cols-2 gap-6">
              {/* Before Column */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-ink/70">
                    ① HIỆN TRẠNG (BEFORE)
                  </span>
                  <span className="rounded bg-ink/10 px-2 py-0.5 text-[10px] text-ink/60">
                    Ảnh Gốc
                  </span>
                </div>
                <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-ink/20 bg-ink/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={beforeSrc || undefined}
                    alt="Hiện trạng ban đầu"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>

              {/* After Column */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-brand-primary">
                    ② PHƯƠNG ÁN THIẾT KẾ AI (AFTER 4K)
                  </span>
                  <span className="rounded bg-brand-primary/20 px-2 py-0.5 text-[10px] font-bold text-brand-primary">
                    Ultra-HD Photorealistic
                  </span>
                </div>
                <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border-2 border-brand-primary/60 bg-ink/5 shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={afterSrc || undefined}
                    alt="Phương án thiết kế AI"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            </div>

            {/* Design Specifications & Palette */}
            <div className="mt-6 grid grid-cols-3 gap-4 rounded-xl border border-border bg-white/70 p-4 text-xs">
              <div>
                <span className="font-semibold text-ink/50 block text-[10px] uppercase">
                  Không Gian
                </span>
                <span className="font-bold text-ink text-sm">{roomType}</span>
              </div>
              <div>
                <span className="font-semibold text-ink/50 block text-[10px] uppercase">
                  Phong Cách
                </span>
                <span className="font-bold text-ink text-sm">{style}</span>
              </div>
              <div>
                <span className="font-semibold text-ink/50 block text-[10px] uppercase">
                  Bảng Màu Chủ Đạo
                </span>
                <span className="font-bold text-ink text-sm">{palette}</span>
              </div>
            </div>

            {/* Notes & Disclaimer */}
            <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-3 text-[11px] text-ink/60">
              <p className="max-w-xl italic">
                &ldquo;{designNotes}&rdquo;
              </p>
              <div className="text-right text-[10px] font-semibold text-ink/60">
                {branding?.brandName ? (
                  <span>
                    {branding.brandName}
                    {branding.contactPhone && <span> • Hotline: {branding.contactPhone}</span>}
                    {branding.contactAddress && <span> • {branding.contactAddress}</span>}
                  </span>
                ) : (
                  <span>Powered by HomeDesign AI B2B • https://design.7app.online</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
