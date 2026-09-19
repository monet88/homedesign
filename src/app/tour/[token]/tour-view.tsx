"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth/session-stub";
import type { PanoramaTour, PanoramaScene } from "@/lib/panorama/types";
import type { StudioBranding } from "@/lib/branding/types";
import { PanoramaTourViewer } from "@/components/panorama/panorama-tour-viewer";
import { TourEditorModal } from "@/components/panorama/tour-editor-modal";
import { TourQrModal } from "@/components/panorama/tour-qr-modal";

export interface TourViewPanelProps {
  token: string;
  tour: PanoramaTour | null;
  branding: StudioBranding | null;
  isEmbed?: boolean;
}

export default function TourViewPanel({
  token,
  tour: initialTour,
  branding,
  isEmbed = false,
}: TourViewPanelProps) {
  const { user } = useSession();
  const [tour, setTour] = useState<PanoramaTour | null>(initialTour);
  const [editorOpen, setEditorOpen] = useState(false);
  const [availableAssets, setAvailableAssets] = useState<Array<{ id: string; name?: string; createdAt?: number }>>([]);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);
  const [activeSceneId, setActiveSceneId] = useState<string>(() => {
    return initialTour?.firstSceneId || initialTour?.scenes?.[0]?.id || "";
  });

  const isOwner = Boolean(user && tour && (user.id === tour.userId || user.role === "admin"));

  // Fetch available assets if owner opens or prepares to edit
  const handleOpenEditor = async () => {
    if (!tour) return;
    try {
      const [tourRes, assetsRes] = await Promise.all([
        fetch(`/api/tours/${tour.id}`),
        fetch(`/api/assets?limit=100&lifecycle=ready`),
      ]);
      if (tourRes.ok) {
        const json = (await tourRes.json()) as { code?: number; data?: { tour?: PanoramaTour } };
        if (json.data?.tour) {
          setTour(json.data.tour);
        }
      }
      if (assetsRes.ok) {
        const json = (await assetsRes.json()) as { data?: { items?: Array<{ id: string; name?: string; createdAt?: number }> } };
        if (json.data?.items) {
          setAvailableAssets(json.data.items);
        }
      }
    } catch {
      // fallback to current tour
    }
    setEditorOpen(true);
  };

  if (!tour) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090d13] px-4 text-center text-white">
        <div className="max-w-md rounded-3xl border border-brand-gold/30 bg-[#0f1520]/80 p-8 shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-gold/15 text-2xl text-brand-gold">
            🏛️
          </div>
          <h1 className="text-xl font-extrabold text-white">Bản xem thực tế ảo không khả dụng</h1>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            Liên kết VR 360 Tour này không tồn tại, đã hết hạn hoặc đã được chủ sở hữu thiết lập ở chế độ riêng tư.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-gold via-brand-highlight to-brand-gold px-5 py-2.5 text-xs font-bold text-black shadow-md transition hover:opacity-90"
            >
              Trở về trang chủ HomeDesign
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const scenes: PanoramaScene[] = tour.scenes || [];
  const currentScene = scenes.find((s) => s.id === activeSceneId) || scenes[0];

  const origin = typeof window !== "undefined" ? window.location.origin : "https://design.7app.online";
  const shareUrl = `${origin}/tour/${encodeURIComponent(token)}`;
  const embedCode = `<iframe src="${shareUrl}?embed=1" width="100%" height="600" frameborder="0" allow="accelerometer; gyroscope; vr; xr; fullscreen" style="border:0; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.4);"></iframe>`;

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore
    }
  };

  const copyEmbedCode = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopiedIframe(true);
      setTimeout(() => setCopiedIframe(false), 2000);
    } catch {
      // ignore
    }
  };


  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#090d13] font-sans text-white select-none">
      {/* 1. Core 360 Multi-Scene Engine */}
      <div className="absolute inset-0 z-0">
        {scenes.length > 0 ? (
          <PanoramaTourViewer
            scenes={scenes}
            initialSceneId={activeSceneId}
            shareToken={token}
            onSceneChange={(id) => setActiveSceneId(id)}
            className="h-full w-full"
            showControls={true}
            showThumbnails={true}
            showVrButton={true}
            showGyroButton={true}
            showFullscreenButton={true}
            autoRotate={-1.5}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-500">
            Chưa có hình ảnh không gian 360 trong căn nhà này.
          </div>
        )}
      </div>

      {/* 2. Top Obsidian Gold Navigation Bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between p-4 sm:p-6">
        {/* Studio Branding & Project Name */}
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/15 bg-black/65 px-4 py-2.5 backdrop-blur-md shadow-2xl">
          {branding?.brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.brandLogoUrl}
              alt={branding.brandName || "Studio Logo"}
              className="size-8 rounded-lg object-contain"
            />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-lg bg-brand-gold/20 text-sm font-bold text-brand-gold">
              🏛️
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-extrabold tracking-tight text-white sm:text-sm">
                {tour.title}
              </h1>
              <span className="hidden rounded-md border border-brand-gold/40 bg-brand-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-gold sm:inline-block">
                VR 360 Tour
              </span>
            </div>
            <p className="text-[10px] text-neutral-400">
              {branding?.brandName || "HomeDesign AI Studio"}
              {branding?.contactPhone && ` · Hotline: ${branding.contactPhone}`}
            </p>
          </div>
        </div>

        {/* Share & Embed Quick Action Button */}
        {!isEmbed && (
          <div className="pointer-events-auto flex items-center gap-2">
            {isOwner && (
              <button
                type="button"
                onClick={handleOpenEditor}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-white/20 bg-black/65 px-3.5 py-2.5 text-xs font-bold text-white shadow-2xl backdrop-blur-md transition hover:border-brand-gold/60 hover:bg-black/85 hover:text-brand-gold"
                title="Mở Studio Editor chỉnh sửa điểm ghim và phòng"
              >
                <span>✏️</span>
                <span className="hidden sm:inline">Chỉnh sửa Tour</span>
              </button>
            )}
            {/* QR Code Action Button */}
            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/20 bg-black/65 px-3 py-2.5 text-xs font-bold text-white shadow-2xl backdrop-blur-md transition hover:border-brand-gold/60 hover:bg-black/85 hover:text-brand-gold"
              title="Xem và tải mã QR Code in hồ sơ bản vẽ kỹ thuật"
            >
              <span>📱</span>
              <span className="hidden sm:inline">Mã QR</span>
            </button>

            <button
              type="button"
              onClick={() => setShareModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-brand-gold/40 bg-black/65 px-4 py-2.5 text-xs font-bold text-brand-gold shadow-2xl backdrop-blur-md transition hover:border-brand-gold hover:bg-black/85"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>Chia sẻ & Nhúng</span>
            </button>
          </div>
        )}
      </header>

      {/* 3. Watermark Overlay (If Enabled by Studio in Sprint 9) */}
      {branding?.watermarkEnabled && (
        <div
          className={`pointer-events-none absolute z-10 p-4 text-[10px] font-bold tracking-widest uppercase opacity-40 select-none ${
            branding.watermarkPosition === "bottom-left"
              ? "left-4 bottom-20"
              : branding.watermarkPosition === "center"
              ? "left-1/2 bottom-24 -translate-x-1/2"
              : "right-4 bottom-20"
          }`}
        >
          <span className="rounded-lg bg-black/50 px-3 py-1.5 backdrop-blur-xs text-white border border-white/10">
            {branding.watermarkText || `© ${(branding.brandName || "STUDIO").toUpperCase()} ARCHITECTS`}
          </span>
        </div>
      )}

      {/* 4. Bottom Attribution Bar */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex items-center justify-between px-6 text-[10px] text-white/40">
        <div>
          <span>{currentScene?.name || "Không gian 360"} · </span>
          <span>Bản quyền thiết kế bởi {branding?.brandName || "HomeDesign AI"}</span>
        </div>
        <div className="pointer-events-auto">
          <Link
            href="/"
            target="_blank"
            className="text-brand-gold/70 hover:text-brand-gold hover:underline"
          >
            Powered by HomeDesign Studio
          </Link>
        </div>
      </footer>

      {/* 5. Share & Iframe Embed Modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-lg rounded-3xl border border-brand-gold/30 bg-neutral-900/95 p-6 text-white shadow-2xl backdrop-blur-md sm:p-8">
            <button
              type="button"
              onClick={() => setShareModalOpen(false)}
              className="absolute right-5 top-5 flex size-8 items-center justify-center rounded-full border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>

            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-brand-gold/20 text-xl text-brand-gold">
                🔗
              </span>
              <div>
                <h3 className="text-lg font-extrabold text-white">Chia Sẻ Thực Tế Ảo VR 360</h3>
                <p className="text-xs text-neutral-400">
                  Gửi liên kết cho gia chủ hoặc nhúng trực tiếp vào website công ty
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {/* Direct Link */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-gold mb-1">
                  1. Đường dẫn xem trực tiếp (Web & Smartphone)
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/50 p-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 bg-transparent px-2 text-xs text-white outline-hidden select-all"
                  />
                  <button
                    type="button"
                    onClick={copyShareLink}
                    className="rounded-lg bg-brand-gold px-3.5 py-1.5 text-xs font-bold text-black transition hover:bg-brand-gold/90"
                  >
                    {copiedLink ? "Đã chép!" : "Sao chép"}
                  </button>
                </div>
              </div>

              {/* Iframe Embed Code */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-gold mb-1">
                  2. Mã nhúng Iframe (Dành cho Website KTS / Bất động sản)
                </label>
                <div className="rounded-xl border border-white/15 bg-black/50 p-2">
                  <textarea
                    rows={3}
                    readOnly
                    value={embedCode}
                    className="w-full bg-transparent px-2 font-mono text-[11px] text-neutral-300 outline-hidden select-all resize-none"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={copyEmbedCode}
                      className="rounded-lg border border-brand-gold/50 bg-brand-gold/10 px-3.5 py-1.5 text-xs font-bold text-brand-gold transition hover:bg-brand-gold/20"
                    >
                      {copiedIframe ? "Đã chép mã!" : "Sao chép mã Iframe"}
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. High-Resolution QR Code */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-gold mb-1">
                  3. Mã QR Code Bản Vẽ (In Hồ Sơ Kỹ Thuật / CAD / Standee)
                </label>
                <div className="flex items-center justify-between gap-2 rounded-xl border border-white/15 bg-black/50 p-2.5">
                  <div className="flex items-center gap-2 text-xs text-neutral-300">
                    <span className="text-base">📱</span>
                    <span>Xuất ảnh PNG 1024px hoặc Vector SVG in ấn</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShareModalOpen(false);
                      setQrModalOpen(true);
                    }}
                    className="rounded-lg bg-brand-gold px-3.5 py-1.5 text-xs font-bold text-black transition hover:bg-brand-gold/90 shrink-0"
                  >
                    Tải Mã QR
                  </button>
                </div>
              </div>

              {/* Social Quick Share Shortcuts */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-neutral-400">
                <span>Chia sẻ nhanh:</span>
                <div className="flex items-center gap-2">
                  <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white hover:border-white/30 hover:bg-white/10"
                  >
                    Facebook
                  </a>
                  <a
                    href={`https://zalo.me/share?url=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white hover:border-white/30 hover:bg-white/10"
                  >
                    Zalo
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Studio Tour Editor Modal (For Architect / Owner) */}
      {editorOpen && tour && (
        <TourEditorModal
          tour={tour}
          isOpen={editorOpen}
          availableAssets={availableAssets}
          onClose={() => setEditorOpen(false)}
          onTourUpdated={(updated) => {
            setTour(updated);
            window.location.reload();
          }}
        />
      )}

      {/* 7. Tour QR Code Generator & Downloader Modal */}
      {qrModalOpen && tour && (
        <TourQrModal
          tour={tour}
          isOpen={qrModalOpen}
          onClose={() => setQrModalOpen(false)}
          brandName={branding?.brandName || "HomeDesign AI Architecture Studio"}
        />
      )}
    </div>
  );
}
