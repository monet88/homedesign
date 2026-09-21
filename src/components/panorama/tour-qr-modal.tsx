"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import QRCode from "qrcode";
import type { PanoramaTour } from "@/lib/panorama/types";

export interface TourQrModalProps {
  tour: Pick<PanoramaTour, "title" | "shareToken" | "description"> & { id?: string };
  isOpen: boolean;
  onClose: () => void;
  brandName?: string;
}

type QrStyleMode = "obsidian" | "cad";

export function TourQrModal({
  tour,
  isOpen,
  onClose,
  brandName = "HomeDesign AI Architecture Studio",
}: TourQrModalProps) {
  const [styleMode, setStyleMode] = useState<QrStyleMode>("obsidian");
  const [svgString, setSvgString] = useState<string>("");
  const [dataUrl, setDataUrl] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://design.7app.online";
  const shareUrl = `${origin}/tour/${encodeURIComponent(tour.shareToken)}`;

  // Generate QR Code data whenever style or shareUrl changes
  const generateQrCode = useCallback(async () => {
    setIsGenerating(true);
    try {
      const isObsidian = styleMode === "obsidian";
      const darkColor = isObsidian ? "#d4af37" : "#000000";
      const lightColor = isObsidian ? "#090d13" : "#ffffff";

      // 1. Generate SVG vector
      const svg = await QRCode.toString(shareUrl, {
        type: "svg",
        margin: 2,
        width: 320,
        color: {
          dark: darkColor,
          light: lightColor,
        },
        errorCorrectionLevel: "H",
      });
      setSvgString(svg);

      // 2. Generate preview DataURL
      const url = await QRCode.toDataURL(shareUrl, {
        margin: 2,
        width: 400,
        color: {
          dark: darkColor,
          light: lightColor,
        },
        errorCorrectionLevel: "H",
      });
      setDataUrl(url);
    } catch (err) {
      console.error("Lỗi khi tạo mã QR Tour:", err);
    } finally {
      setIsGenerating(false);
    }
  }, [shareUrl, styleMode]);

  useEffect(() => {
    if (isOpen) {
      void generateQrCode();
    }
  }, [isOpen, generateQrCode]);

  if (!isOpen) return null;

  // Copy share URL to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  // Download High-Resolution PNG (1024x1024) with Architectural Handoff Frame
  const handleDownloadPng = async () => {
    const isObsidian = styleMode === "obsidian";
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1280;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = isObsidian ? "#090d13" : "#ffffff";
    ctx.fillRect(0, 0, 1024, 1280);

    // Decorative Border Frame
    ctx.strokeStyle = isObsidian ? "#d4af37" : "#1a1a1a";
    ctx.lineWidth = 4;
    ctx.strokeRect(32, 32, 960, 1216);

    ctx.strokeStyle = isObsidian ? "rgba(212, 175, 55, 0.4)" : "#e5e5e5";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(44, 44, 936, 1192);

    // Top Header
    ctx.fillStyle = isObsidian ? "#d4af37" : "#000000";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("VR TOUR 360° · HỒ SƠ BÀN GIAO THIẾT KẾ", 512, 100);

    // Project Title
    ctx.fillStyle = isObsidian ? "#ffffff" : "#111111";
    ctx.font = "bold 34px sans-serif";
    const titleText = tour.title.length > 38 ? `${tour.title.slice(0, 38)}...` : tour.title;
    ctx.fillText(titleText, 512, 155);

    // Subtitle / Studio
    ctx.fillStyle = isObsidian ? "rgba(255, 255, 255, 0.6)" : "#666666";
    ctx.font = "18px sans-serif";
    ctx.fillText(brandName, 512, 195);

    // Divider
    ctx.strokeStyle = isObsidian ? "rgba(212, 175, 55, 0.3)" : "#dddddd";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(120, 230);
    ctx.lineTo(904, 230);
    ctx.stroke();

    // Draw QR Code in Center (620x620)
    const qrImage = new Image();
    const qrDataUrl = await QRCode.toDataURL(shareUrl, {
      margin: 1,
      width: 620,
      color: {
        dark: isObsidian ? "#d4af37" : "#000000",
        light: isObsidian ? "#090d13" : "#ffffff",
      },
      errorCorrectionLevel: "H",
    });

    await new Promise<void>((resolve) => {
      qrImage.onload = () => {
        ctx.drawImage(qrImage, 202, 270, 620, 620);
        resolve();
      };
      qrImage.src = qrDataUrl;
    });

    // Box around QR
    ctx.strokeStyle = isObsidian ? "rgba(212, 175, 55, 0.5)" : "#cccccc";
    ctx.lineWidth = 2;
    ctx.strokeRect(192, 260, 640, 640);

    // Bottom Instructions
    ctx.fillStyle = isObsidian ? "#d4af37" : "#000000";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("QUÉT MÃ BẰNG CAMERA ĐIỆN THOẠI HOẶC ZALO", 512, 960);

    ctx.fillStyle = isObsidian ? "rgba(255, 255, 255, 0.7)" : "#555555";
    ctx.font = "16px sans-serif";
    ctx.fillText("Tham quan thực tế ảo 360° với con quay hồi chuyển & kính VR", 512, 995);

    // URL link
    ctx.fillStyle = isObsidian ? "#d4af37" : "#2563eb";
    ctx.font = "16px monospace";
    ctx.fillText(shareUrl, 512, 1045);

    // Footer Attribution
    ctx.strokeStyle = isObsidian ? "rgba(212, 175, 55, 0.2)" : "#eeeeee";
    ctx.beginPath();
    ctx.moveTo(150, 1100);
    ctx.lineTo(874, 1100);
    ctx.stroke();

    ctx.fillStyle = isObsidian ? "rgba(255, 255, 255, 0.4)" : "#888888";
    ctx.font = "14px sans-serif";
    ctx.fillText("Bản quyền thiết kế bởi HomeDesign Studio · Hệ thống kết xuất 3D Panorama", 512, 1140);

    // Trigger Download
    const link = document.createElement("a");
    const sanitizedTitle = tour.title.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+/g, "_");
    link.download = `${sanitizedTitle}_QR_Code_1024px.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  // Download Vector SVG for CAD / Illustrator / InDesign
  const handleDownloadSvg = () => {
    if (!svgString) return;
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const link = document.createElement("a");
    const sanitizedTitle = tour.title.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+/g, "_");
    link.download = `${sanitizedTitle}_QR_Vector.svg`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const isObsidian = styleMode === "obsidian";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-3xl border border-brand-gold/30 bg-neutral-950 p-6 text-white shadow-2xl sm:p-8">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 flex size-8 items-center justify-center rounded-full border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
          title="Đóng cửa sổ"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-brand-gold/20 text-xl text-brand-gold">
            📱
          </span>
          <div>
            <h3 className="text-lg font-extrabold text-white">Mã QR Code Bàn Giao VR Tour</h3>
            <p className="text-xs text-neutral-400">
              Xuất mã QR độ nét cao in lên hồ sơ bản vẽ hoặc gửi khách hàng
            </p>
          </div>
        </div>

        {/* Style Selector Tabs (Obsidian Gold vs CAD Blueprint) */}
        <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-black/50 p-1.5">
          <button
            type="button"
            onClick={() => setStyleMode("obsidian")}
            className={`flex-1 rounded-xl py-1.5 text-xs font-bold transition ${
              isObsidian
                ? "bg-brand-gold text-black shadow-md"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            ✨ Obsidian Gold (Bản Số)
          </button>
          <button
            type="button"
            onClick={() => setStyleMode("cad")}
            className={`flex-1 rounded-xl py-1.5 text-xs font-bold transition ${
              !isObsidian
                ? "bg-white text-black shadow-md"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            📐 In Bản Vẽ CAD (Trắng Đen)
          </button>
        </div>

        {/* QR Code Preview Card */}
        <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-white/10 p-5 transition bg-[#090d13]">
          <div
            className={`relative flex size-56 items-center justify-center overflow-hidden rounded-2xl border p-3 transition ${
              isObsidian
                ? "border-brand-gold/40 bg-[#090d13] shadow-[0_0_25px_rgba(212,175,55,0.2)]"
                : "border-neutral-300 bg-white"
            }`}
          >
            {isGenerating ? (
              <div className="flex flex-col items-center gap-2 text-neutral-400">
                <div className="size-6 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
                <span className="text-[11px]">Đang kết xuất mã QR...</span>
              </div>
            ) : dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dataUrl}
                alt={`Mã QR VR Tour: ${tour.title}`}
                className="size-full object-contain"
              />
            ) : null}
          </div>

          {/* Project Title and Specs */}
          <div className="mt-3 text-center">
            <h4 className="text-sm font-bold text-white line-clamp-1">{tour.title}</h4>
            <p className="text-[11px] text-brand-gold font-medium mt-0.5">
              VR Tour 360° · Scan to Experience
            </p>
          </div>
        </div>

        {/* Share Link Copy Field */}
        <div className="mt-4">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
            Đường dẫn xem trực tiếp:
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/60 p-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 bg-transparent px-2 text-xs text-white outline-hidden select-all"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-lg bg-brand-gold px-3.5 py-1.5 text-xs font-bold text-black transition hover:bg-brand-gold/90 shrink-0"
            >
              {copied ? "Đã chép!" : "Sao chép"}
            </button>
          </div>
        </div>

        {/* Action Buttons: Download High-Res PNG & Vector SVG */}
        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {/* High-Res PNG */}
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={isGenerating || !dataUrl}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-gold via-brand-highlight to-brand-gold px-4 py-2.5 text-xs font-bold text-black shadow-lg transition hover:opacity-95 disabled:opacity-50"
            title="Tải file PNG độ phân giải 1024x1280 có sẵn khung hồ sơ bản vẽ"
          >
            <span>📥</span>
            <span>Tải Ảnh PNG (1024px)</span>
          </button>

          {/* Vector SVG */}
          <button
            type="button"
            onClick={handleDownloadSvg}
            disabled={isGenerating || !svgString}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-bold text-white transition hover:border-brand-gold/50 hover:bg-white/10 disabled:opacity-50"
            title="Tải file Vector SVG để import trực tiếp vào AutoCAD, Revit, Adobe Illustrator"
          >
            <span>📐</span>
            <span>Tải Vector SVG (CAD)</span>
          </button>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
