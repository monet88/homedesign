"use client";

import { useEffect, useState } from "react";

interface GeneratingScannerProps {
  previewSrc: string | null;
  status: string;
  modelName?: string;
  roomType?: string;
  designStyle?: string;
}

const MILESTONES = [
  {
    atSecond: 0,
    title: "Phân tích không gian & nhận diện cấu trúc",
    desc: "AI đang quét lưới hình học 3D, định vị diện tường, sàn và nguồn sáng tự nhiên...",
    progress: 25,
  },
  {
    atSecond: 3,
    title: "Tái cấu trúc nội thất & gán vật liệu",
    desc: "Áp dụng phong cách kiến trúc chỉ định, chọn lọc đồ décor và cân đối tỷ lệ công năng...",
    progress: 55,
  },
  {
    atSecond: 7,
    title: "Chiếu sáng PBR & Đổ bóng quang học",
    desc: "Mô phỏng tia sáng toàn cục (Global Illumination), phản xạ vật liệu và xử lý chất lượng ảnh...",
    progress: 82,
  },
  {
    atSecond: 11,
    title: "Hoàn thiện chi tiết bản vẽ Studio",
    desc: "Khử nhiễu chi tiết cuối cùng, xuất ảnh sắc nét và đồng bộ vào dự án...",
    progress: 95,
  },
];

export function GeneratingScanner({
  previewSrc,
  status,
  modelName = "Google Gemini 2.5 Flash Image",
  roomType,
  designStyle,
}: GeneratingScannerProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Determine active milestone based on elapsed seconds
  const activeMilestone =
    MILESTONES.slice().reverse().find((m) => seconds >= m.atSecond) || MILESTONES[0];

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-stone-950 p-6 shadow-2xl text-stone-100">
      {/* Background glow effects */}
      <div className="absolute -left-20 -top-20 size-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -right-20 -bottom-20 size-64 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="relative z-10 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex size-10 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/40 shadow-inner">
            <div className="size-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            <div className="absolute inset-0 rounded-xl animate-ping opacity-25 bg-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              <span>Studio AI Đang Khởi Tạo Phối Cảnh</span>
              <span className="rounded-full bg-amber-400/20 border border-amber-400/40 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                {status.toUpperCase()}
              </span>
            </h3>
            <p className="text-xs text-stone-400">
              Mô hình: <strong className="text-stone-300">{modelName}</strong>
              {roomType ? ` · ${roomType}` : ""}
              {designStyle ? ` · ${designStyle}` : ""}
            </p>
          </div>
        </div>

        {/* Live Timer */}
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-md">
          <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-mono font-bold text-amber-300">
            {formatTimer(seconds)}s
          </span>
        </div>
      </div>

      {/* Main Image Scanner Stage */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-stone-900 shadow-inner">
        {previewSrc ? (
          <img
            src={previewSrc}
            alt="Đang quét không gian"
            className="h-full w-full object-cover opacity-60 filter contrast-125 brightness-90"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-stone-900">
            <div className="size-16 animate-pulse rounded-2xl bg-white/5" />
          </div>
        )}

        {/* Architectural Grid Overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-25"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(251, 191, 36, 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(251, 191, 36, 0.15) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Laser Scanning Beam */}
        <div
          className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_15px_#f59e0b] pointer-events-none transition-all duration-300"
          style={{
            top: `${(Math.sin(seconds * 1.5) * 0.45 + 0.5) * 100}%`,
          }}
        />

        {/* Floating Corner Badges (Studio Viewfinder) */}
        <div className="absolute top-3 left-3 rounded border border-amber-400/40 bg-black/60 px-2 py-0.5 text-[10px] font-mono text-amber-300 backdrop-blur-xs">
          AI_SCAN // 3D_INTERIOR_MESH
        </div>
        <div className="absolute bottom-3 right-3 rounded border border-white/20 bg-black/60 px-2 py-0.5 text-[10px] font-mono text-stone-300 backdrop-blur-xs">
          GI_RAYTRACING // PASS_READY
        </div>
      </div>

      {/* Progress & Milestone info below image */}
      <div className="relative z-10 mt-5 space-y-3">
        {/* Animated Progress Bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-stone-200">
              {activeMilestone.title}
            </span>
            <span className="font-mono text-amber-400 font-bold">
              {Math.min(activeMilestone.progress + Math.floor((seconds % 3) * 3), 96)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-amber-500 via-orange-400 to-amber-300 transition-all duration-700 rounded-full shadow-[0_0_12px_rgba(251,191,36,0.6)]"
              style={{
                width: `${Math.min(activeMilestone.progress + Math.floor((seconds % 3) * 3), 96)}%`,
              }}
            />
          </div>
        </div>

        {/* Milestone Description */}
        <p className="text-xs text-stone-400 leading-relaxed min-h-[36px] flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-amber-400 shrink-0" />
          <span>{activeMilestone.desc}</span>
        </p>
      </div>
    </div>
  );
}
