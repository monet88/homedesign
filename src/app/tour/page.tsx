"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth/session-stub";
import type { PanoramaTour } from "@/lib/panorama/types";
import { TourEditorModal } from "@/components/panorama/tour-editor-modal";
import { AssetPickerModal, isLikelyPanorama } from "@/components/panorama/asset-picker-modal";
import { TourQrModal } from "@/components/panorama/tour-qr-modal";
import { BatchPanoramaModal } from "@/components/panorama/batch-panorama-modal";
import { DEMO_PENTHOUSE_TOUR } from "@/lib/panorama/demo-tour";

export default function TourDashboardPage() {
  const { user } = useSession();

  const [tours, setTours] = useState<PanoramaTour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // QR Code Modal state
  const [qrTour, setQrTour] = useState<PanoramaTour | null>(null);
  const [isQrOpen, setIsQrOpen] = useState(false);

  // AI Batch Panorama Modal state
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [autoLinkingTourId, setAutoLinkingTourId] = useState<string | null>(null);

  // Editor Modal state
  const [editingTour, setEditingTour] = useState<PanoramaTour | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Create Tour Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIsPublic, setNewIsPublic] = useState(true);
  const [availableAssets, setAvailableAssets] = useState<Array<{ id: string; name?: string; createdAt?: number }>>([]);
  const [initialAssetId, setInitialAssetId] = useState("");
  const [initialSceneName, setInitialSceneName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);

  // Copy notification state
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Fetch Tours list
  const fetchTours = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tours");
      if (!res.ok) {
        throw new Error("Không thể tải danh sách tour");
      }
      const json = (await res.json()) as { code?: number; data?: { tours?: PanoramaTour[]; items?: PanoramaTour[] } };
      setTours(json.data?.tours || json.data?.items || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi hệ thống");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch available panorama assets for quick selection (only ready assets)
  const fetchAssets = useCallback(async () => {
    try {
      const res = await fetch("/api/assets?limit=100&lifecycle=ready");
      if (res.ok) {
        const json = (await res.json()) as { data?: { items?: Array<{ id: string; name?: string; createdAt?: number; isGenerated?: boolean; isSource?: boolean }> } };
        setAvailableAssets(json.data?.items || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (user?.emailVerified) {
      void fetchTours();
      void fetchAssets();
    }
  }, [user?.emailVerified, fetchTours, fetchAssets]);

  // Create new Tour
  const handleCreateTour = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setCreateError("Vui lòng nhập tên công trình / Tour");
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const payload: { title: string; description?: string; isPublic: boolean } = {
        title: newTitle.trim(),
        isPublic: newIsPublic,
      };
      if (newDescription.trim()) {
        payload.description = newDescription.trim();
      }

      const res = await fetch("/api/tours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as {
        code?: number;
        data?: { tour: PanoramaTour };
        error?: string;
        message?: string;
        details?: Record<string, { _errors?: string[] }>;
      };

      if (!res.ok || json.code !== 0 || !json.data?.tour) {
        let errorMsg = json.message || json.error || "Tạo tour thất bại";
        if (json.details) {
          const detailMsgs = Object.entries(json.details)
            .map(([field, err]) => `${field}: ${err._errors?.join(", ") || ""}`)
            .join("; ");
          if (detailMsgs) errorMsg = `Dữ liệu không hợp lệ (${detailMsgs})`;
        }
        throw new Error(errorMsg);
      }

      const created = json.data.tour;

      // If user selected an initial panorama asset, create first scene immediately
      if (initialAssetId) {
        await fetch(`/api/tours/${created.id}/scenes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: initialSceneName.trim() || "Phòng chính",
            assetId: initialAssetId,
            initialYaw: 0,
            initialPitch: 0,
            initialHfov: 100,
          }),
        });
      }

      // Reset form
      setNewTitle("");
      setNewDescription("");
      setInitialAssetId("");
      setInitialSceneName("");
      setIsCreateOpen(false);

      // Refresh and open editor directly on the newly created tour
      await fetchTours();
      const freshRes = await fetch(`/api/tours/${created.id}`);
      if (freshRes.ok) {
        const freshJson = (await freshRes.json()) as { data?: { tour: PanoramaTour } };
        if (freshJson.data?.tour) {
          setEditingTour(freshJson.data.tour);
          setIsEditorOpen(true);
        }
      }
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Lỗi khi tạo tour");
    } finally {
      setIsCreating(false);
    }
  };

  // Auto-link portal hotspots between scenes in a tour
  const handleAutoLink = async (tourId: string) => {
    setAutoLinkingTourId(tourId);
    try {
      const res = await fetch(`/api/tours/${tourId}/auto-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: "hub_and_spoke" }),
      });
      const json = (await res.json()) as { code?: number; data?: { linkedCount: number }; message?: string };
      if (!res.ok || json.code !== 0) {
        alert(json.message || "Tự động liên kết phòng thất bại");
        return;
      }
      await fetchTours();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Lỗi kết nối");
    } finally {
      setAutoLinkingTourId(null);
    }
  };

  // Delete Tour
  const handleDeleteTour = async (tourId: string, title: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa Tour "${title}" không? Hành động này không thể hoàn tác.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/tours/${tourId}`, { method: "DELETE" });
      if (res.ok) {
        setTours((prev) => prev.filter((t) => t.id !== tourId));
      } else {
        alert("Không thể xóa tour. Vui lòng thử lại sau.");
      }
    } catch {
      alert("Lỗi khi xóa tour");
    }
  };

  // Copy share link
  const handleCopyLink = async (shareToken: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://design.7app.online";
    const shareUrl = `${origin}/tour/${encodeURIComponent(shareToken)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedToken(shareToken);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // fallback
    }
  };

  if (!user) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 text-center text-foreground sm:px-6">
        <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-primary/10 text-2xl text-brand-primary">
            🏛️
          </div>
          <h1 className="text-xl font-bold">Đăng nhập để vào Studio VR Tour</h1>
          <p className="mt-2 text-xs text-foreground/60">
            Vui lòng đăng nhập tài khoản Kiến trúc sư để thiết kế và quản lý các tour thực tế ảo 360°.
          </p>
          <Link
            href="/sign-in"
            className="mt-6 inline-block rounded-xl bg-brand-primary px-6 py-2.5 text-xs font-bold text-white shadow-md transition hover:opacity-90"
          >
            Đăng Nhập Ngay
          </Link>
        </div>
      </main>
    );
  }

  if (user.emailVerified === false) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 text-center text-foreground sm:px-6">
        <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl">
          <h1 className="text-xl font-bold">Xác thực Email</h1>
          <p className="mt-2 text-xs text-foreground/60">
            Vui lòng xác thực email để kích hoạt tính năng VR Tour 360 Studio.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 font-sans">
      {/* 1. Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              VR Tour 360° Studio
            </h1>
            <span className="rounded-md border border-brand-gold/40 bg-brand-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-gold">
              Multi-Room
            </span>
          </div>
          <p className="mt-1 text-xs text-foreground/60">
            Thiết kế tour thực tế ảo đa không gian, cắm mốc chuyển phòng và ghi chú vật liệu photorealistic dành cho KTS.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => setIsBatchOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 px-4 py-2.5 text-xs font-bold text-zinc-950 shadow-lg shadow-amber-500/20 transition hover:opacity-95"
            title="AI tự động sinh 3-5 phòng 360° đồng bộ phong cách và tạo Tour VR"
          >
            <span className="text-sm">🪄</span>
            <span>AI Batch Sinh Tour 360°</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white shadow-lg transition hover:bg-white/10 hover:border-brand-gold/50"
          >
            <span className="text-sm">✨</span>
            <span>+ Tạo VR Tour Mới</span>
          </button>
        </div>
      </div>

      {/* 1.5. Architectural Demo Showcase Banner */}
      <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-brand-gold/35 bg-gradient-to-r from-brand-gold/15 via-black/50 to-black/80 p-5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between shadow-lg">
        <div className="flex items-start gap-3.5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-gold/20 text-2xl text-brand-gold shadow-inner">
            🏛️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-brand-gold/50 bg-brand-gold/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-brand-gold">
                Tour Mẫu Trải Nghiệm
              </span>
              <span className="text-[11px] text-foreground/60">3 Không Gian Liên Hoàn</span>
            </div>
            <h2 className="text-base font-bold text-white mt-1">
              Penthouse Horizon Sky Villa (Demo VR 360°)
            </h2>
            <p className="text-xs text-foreground/70 line-clamp-1 mt-0.5">
              Khám phá Phòng Khách Skyview, Khu Bếp Gourmet & Phòng Ngủ Master Kính Cong với các điểm neo chuyển phòng.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <Link
            href="/tour/demo-penthouse"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-gold px-4 py-2 text-xs font-bold text-black transition hover:bg-brand-gold/90 shadow-md"
          >
            <span>👁️</span>
            <span>Trải Nghiệm Ngay</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              setQrTour(DEMO_PENTHOUSE_TOUR);
              setIsQrOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white transition hover:border-brand-gold/50 hover:bg-white/10"
            title="Tải mã QR hồ sơ cho Tour mẫu này"
          >
            <span>📱</span>
            <span>Mã QR</span>
          </button>
        </div>
      </div>

      {/* 2. Loading / Error States */}
      {loading && tours.length === 0 && (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-3xl border border-border bg-card p-5">
              <div className="aspect-video rounded-2xl bg-foreground/10" />
              <div className="mt-4 h-4 w-2/3 rounded bg-foreground/10" />
              <div className="mt-2 h-3 w-1/3 rounded bg-foreground/10" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
          <p>Lỗi: {error}</p>
          <button
            type="button"
            onClick={() => void fetchTours()}
            className="mt-2 font-bold underline"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* 3. Empty State */}
      {!loading && tours.length === 0 && (
        <div className="mt-8 rounded-3xl border border-dashed border-brand-gold/30 bg-card/40 p-8 sm:p-12 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-gold/15 text-3xl text-brand-gold">
            ✨
          </div>
          <h2 className="text-lg font-extrabold text-foreground">
            Bạn chưa tạo Tour VR 360° nào
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-foreground/60">
            Kết nối các góc chụp hoặc hình ảnh kết xuất 360° của căn nhà thành một chuyến tham quan tương tác sống động, cắm mốc chuyển phòng và ghi chú vật liệu photorealistic.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setIsBatchOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-5 py-2.5 text-xs font-bold text-zinc-950 shadow-lg shadow-amber-500/20 transition hover:opacity-90"
            >
              <span>🪄 AI Batch Sinh Trọn Căn Hộ</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-xs font-bold text-foreground transition hover:border-brand-gold/50"
            >
              <span>+ Tạo Thủ Công</span>
            </button>
            <Link
              href="/tour/demo-penthouse"
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-foreground transition hover:border-brand-gold/50"
            >
              <span>🏛️ Xem Tour Mẫu Penthouse</span>
            </Link>
          </div>
        </div>
      )}

      {/* 4. Tours Grid */}
      {tours.length > 0 && (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tours.map((t) => {
            const firstScene = t.scenes?.[0];
            const sceneCount = t.scenes?.length || 0;
            const hotspotCount = (t.scenes || []).reduce(
              (sum, s) => sum + (s.hotspots?.length || 0),
              0
            );

            return (
              <article
                key={t.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:border-brand-gold/50 hover:shadow-xl"
              >
                <div>
                  {/* Thumbnail Banner */}
                  <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-neutral-900 border border-white/5">
                    {firstScene ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={
                          firstScene.assetId.startsWith("/") || firstScene.assetId.startsWith("http")
                            ? firstScene.assetId
                            : `/api/assets/${encodeURIComponent(firstScene.assetId)}/download?inline=1`
                        }
                        alt={t.title}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-foreground/40">
                        Chưa có phòng 360
                      </div>
                    )}
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur-md ${
                          t.isPublic
                            ? "border border-emerald-500/40 bg-emerald-950/80 text-emerald-400"
                            : "border border-neutral-600 bg-black/80 text-neutral-400"
                        }`}
                      >
                        {t.isPublic ? "Công khai" : "Riêng tư"}
                      </span>
                    </div>

                    <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                      <span className="rounded-lg bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md">
                        🚪 {sceneCount} phòng
                      </span>
                      <span className="rounded-lg bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-brand-gold backdrop-blur-md">
                        📍 {hotspotCount} điểm ghim
                      </span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="mt-4">
                    <h3 className="text-base font-bold text-foreground line-clamp-1 group-hover:text-brand-gold transition">
                      {t.title}
                    </h3>
                    <p className="mt-1 text-xs text-foreground/60 line-clamp-2">
                      {t.description || "Chưa có mô tả kiến trúc."}
                    </p>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-5 pt-3 border-t border-border flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {/* Open Studio Editor */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTour(t);
                        setIsEditorOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border border-brand-gold/40 bg-brand-gold/10 px-2.5 py-1.5 text-xs font-bold text-brand-gold transition hover:bg-brand-gold/20"
                      title="Mở Studio Tour Editor để cắm điểm ghim Hotspot"
                    >
                      <span>✏️</span>
                      <span>Chỉnh sửa</span>
                    </button>

                    {/* View Live Tour */}
                    <Link
                      href={`/tour/${encodeURIComponent(t.shareToken)}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 rounded-xl border border-border bg-card/80 px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:border-foreground/30 hover:bg-foreground/5"
                    >
                      <span>👁️</span>
                      <span>Xem</span>
                    </Link>

                    {/* Auto-Link Portal Hotspots Button (when >= 2 scenes) */}
                    {sceneCount >= 2 && (
                      <button
                        type="button"
                        onClick={() => handleAutoLink(t.id)}
                        disabled={autoLinkingTourId === t.id}
                        className="inline-flex items-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
                        title="Tự động tính toán và cắm cửa đi lại thông minh giữa các phòng"
                      >
                        <span>⚡</span>
                        <span>{autoLinkingTourId === t.id ? "Đang liên kết..." : "Auto-Link Cửa"}</span>
                      </button>
                    )}

                    {/* QR Code Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setQrTour(t);
                        setIsQrOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border border-brand-gold/30 bg-brand-gold/10 px-2.5 py-1.5 text-xs font-bold text-brand-gold transition hover:bg-brand-gold/20"
                      title="Tải mã QR Code in hồ sơ bản vẽ"
                    >
                      <span>📱</span>
                      <span>QR</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Copy Link Button */}
                    <button
                      type="button"
                      onClick={() => handleCopyLink(t.shareToken)}
                      className="flex size-8 items-center justify-center rounded-xl border border-border bg-card/80 text-xs text-foreground/70 hover:text-foreground hover:bg-foreground/5"
                      title="Sao chép liên kết xem tour"
                    >
                      {copiedToken === t.shareToken ? (
                        <span className="text-emerald-500 font-bold">✓</span>
                      ) : (
                        <span>🔗</span>
                      )}
                    </button>

                    {/* Delete Tour Button */}
                    <button
                      type="button"
                      onClick={() => handleDeleteTour(t.id, t.title)}
                      className="flex size-8 items-center justify-center rounded-xl border border-red-500/20 text-xs text-red-400 hover:bg-red-500/10"
                      title="Xóa Tour này"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 5. Create Tour Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-lg rounded-3xl border border-brand-gold/30 bg-neutral-950 p-6 text-white shadow-2xl sm:p-8">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="absolute right-5 top-5 flex size-8 items-center justify-center rounded-full border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>

            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-brand-gold/20 text-xl text-brand-gold">
                🏛️
              </span>
              <div>
                <h3 className="text-lg font-extrabold text-white">Tạo Tour Thực Tế Ảo VR 360° Mới</h3>
                <p className="text-xs text-neutral-400">
                  Khởi tạo dự án tour và kết nối các căn phòng của gia chủ
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateTour} className="mt-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-gold mb-1">
                  Tên công trình / Tour *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Biệt Thự Song Lập Ciputra — Nội Thất Indochine"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-neutral-900 px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:border-brand-gold focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-gold mb-1">
                  Mô tả kiến trúc (Tùy chọn)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ví dụ: Thiết kế hoàn mỹ với không gian mở liên hoàn giữa phòng khách, bếp và sân vườn..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-neutral-900 px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:border-brand-gold focus:outline-hidden"
                />
              </div>

              {/* Initial Scene Panorama Selection with Visual Preview */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-gold">
                    Phòng mở màn đầu tiên (Khởi tạo sẵn)
                  </label>
                  <span className="rounded-md bg-brand-gold/10 px-2 py-0.5 text-[9px] font-bold text-brand-gold">
                    Tùy chọn
                  </span>
                </div>
                <p className="text-[10px] text-neutral-400 mb-3">
                  Chọn ngay ảnh Panorama 360° có sẵn để hệ thống tự động tạo phòng chính cho Tour
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1">Tên phòng mở màn</label>
                    <input
                      type="text"
                      placeholder="Ví dụ: Phòng Khách Master, Sảnh Chính, Ban Công..."
                      value={initialSceneName}
                      onChange={(e) => setInitialSceneName(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-neutral-900 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-brand-gold focus:outline-hidden"
                    />
                  </div>

                  {/* Visual Asset Preview / Picker Button */}
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1">Ảnh đại diện 360° của phòng</label>
                    {initialAssetId ? (
                      (() => {
                        const selected = availableAssets.find((a) => a.id === initialAssetId);
                        const isPano = selected ? isLikelyPanorama(selected) : false;
                        return (
                          <div className="flex items-center gap-3 rounded-2xl border border-brand-gold/40 bg-black/40 p-2.5">
                            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-white/15 bg-neutral-800">
                              <img
                                src={`/api/assets/${encodeURIComponent(initialAssetId)}/download?inline=1`}
                                alt={selected?.name || "Asset"}
                                className="size-full object-cover"
                              />
                              {isPano && (
                                <span className="absolute bottom-1 left-1 rounded-sm bg-black/80 px-1 text-[8px] font-extrabold text-brand-gold">
                                  360°
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold text-white">
                                {selected?.name || `Asset ${initialAssetId.slice(0, 16)}`}
                              </p>
                              <p className="mt-0.5 text-[10px]">
                                {isPano ? (
                                  <span className="font-semibold text-green-400">✅ Chuẩn Panorama 360°</span>
                                ) : (
                                  <span className="font-semibold text-yellow-400">⚠️ Ảnh 2D (Có thể bị méo hình)</span>
                                )}
                              </p>
                            </div>
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                onClick={() => setIsAssetPickerOpen(true)}
                                className="rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-white/20"
                              >
                                Đổi ảnh
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setInitialAssetId("");
                                }}
                                className="rounded-lg px-2.5 py-1 text-[10px] font-semibold text-red-400 hover:bg-red-500/10"
                              >
                                Gỡ bỏ
                              </button>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsAssetPickerOpen(true)}
                        className="group flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/20 bg-neutral-900/60 p-4 transition hover:border-brand-gold/60 hover:bg-brand-gold/5"
                      >
                        <span className="text-2xl transition group-hover:scale-110">🖼️</span>
                        <p className="mt-1.5 text-xs font-bold text-white group-hover:text-brand-gold">
                          + Chọn ảnh từ Thư Viện (Có xem trước Preview)
                        </p>
                        <p className="mt-0.5 text-[10px] text-neutral-400">
                          Khuyên dùng ảnh Panorama 360° (tỉ lệ 2:1 toàn cảnh)
                        </p>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Is Public Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5">
                <div>
                  <p className="text-xs font-bold text-white">Chế độ xem công khai</p>
                  <p className="text-[10px] text-neutral-400">
                    Cho phép gia chủ mở link xem trực tiếp mà không cần tài khoản
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={newIsPublic}
                  onChange={(e) => setNewIsPublic(e.target.checked)}
                  className="size-4 accent-brand-gold cursor-pointer"
                />
              </div>

              {createError && (
                <p className="text-xs text-red-400 font-semibold">{createError}</p>
              )}

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-neutral-400 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="rounded-xl bg-gradient-to-r from-brand-gold via-brand-highlight to-brand-gold px-5 py-2 text-xs font-bold text-black shadow-md transition hover:opacity-90"
                >
                  {isCreating ? "Đang tạo..." : "Tạo & Mở Studio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Studio Tour Editor Modal */}
      {isEditorOpen && editingTour && (
        <TourEditorModal
          tour={editingTour}
          isOpen={isEditorOpen}
          availableAssets={availableAssets}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingTour(null);
            void fetchTours();
          }}
          onTourUpdated={(updated) => {
            setEditingTour(updated);
            void fetchTours();
          }}
        />
      )}

      {/* 7. Visual Asset Picker Modal */}
      <AssetPickerModal
        isOpen={isAssetPickerOpen}
        onClose={() => setIsAssetPickerOpen(false)}
        assets={availableAssets}
        selectedAssetId={initialAssetId}
        onSelect={(asset) => {
          setInitialAssetId(asset.id);
          // Auto-suggest initial scene name if empty
          if (!initialSceneName.trim()) {
            const nameLower = (asset.name || "").toLowerCase();
            if (nameLower.includes("living") || nameLower.includes("khach")) {
              setInitialSceneName("Phòng Khách");
            } else if (nameLower.includes("bed") || nameLower.includes("ngu")) {
              setInitialSceneName("Phòng Ngủ Master");
            } else if (nameLower.includes("kitchen") || nameLower.includes("bep")) {
              setInitialSceneName("Phòng Bếp");
            } else if (nameLower.includes("bath") || nameLower.includes("ve-sinh")) {
              setInitialSceneName("Phòng Tắm");
            } else {
              setInitialSceneName(asset.name || "Phòng chính");
            }
          }
        }}
      />

      {/* 8. QR Code Generator & Downloader Modal */}
      {isQrOpen && qrTour && (
        <TourQrModal
          tour={qrTour}
          isOpen={isQrOpen}
          onClose={() => {
            setIsQrOpen(false);
            setQrTour(null);
          }}
        />
      )}

      {/* 9. AI Batch Panorama Generator Modal */}
      {isBatchOpen && (
        <BatchPanoramaModal
          isOpen={isBatchOpen}
          onClose={() => setIsBatchOpen(false)}
          onSuccess={async () => {
            await fetchTours();
          }}
        />
      )}
    </main>
  );
}
