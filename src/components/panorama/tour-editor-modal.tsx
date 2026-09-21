"use client";

import { useState, useCallback, useEffect } from "react";
import type { PanoramaTour, PanoramaScene, PanoramaHotspot } from "@/lib/panorama/types";
import { PanoramaTourViewer } from "./panorama-tour-viewer";
import { AssetPickerModal, isLikelyPanorama } from "./asset-picker-modal";

export interface TourEditorModalProps {
  tour: PanoramaTour;
  isOpen: boolean;
  onClose: () => void;
  onTourUpdated?: (tour: PanoramaTour) => void;
  availableAssets?: Array<{ id: string; name?: string; createdAt?: number }>;
}

export function TourEditorModal({
  tour: initialTour,
  isOpen,
  onClose,
  onTourUpdated,
  availableAssets = [],
}: TourEditorModalProps) {
  const [tour, setTour] = useState<PanoramaTour>(initialTour);
  const [scenes, setScenes] = useState<PanoramaScene[]>(initialTour.scenes || []);
  const [activeSceneId, setActiveSceneId] = useState<string>(
    initialTour.firstSceneId || initialTour.scenes?.[0]?.id || ""
  );
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);

  // Sync state whenever initialTour updates or modal reopens
  useEffect(() => {
    setTour(initialTour);
    setScenes(initialTour.scenes || []);
    if (initialTour.firstSceneId || initialTour.scenes?.[0]?.id) {
      setActiveSceneId((prev) => {
        const exists = (initialTour.scenes || []).some((s) => s.id === prev);
        return exists ? prev : (initialTour.firstSceneId || initialTour.scenes?.[0]?.id || "");
      });
    }
  }, [initialTour]);

  // Editor states
  const [isPickingCoord, setIsPickingCoord] = useState(true);
  const [selectedPitch, setSelectedPitch] = useState<number>(0);
  const [selectedYaw, setSelectedYaw] = useState<number>(0);
  const [hasPickedCoord, setHasPickedCoord] = useState(false);

  // Hotspot Form state
  const [hotspotType, setHotspotType] = useState<"scene" | "info">("scene");
  const [hotspotTitle, setHotspotTitle] = useState("");
  const [hotspotTargetSceneId, setHotspotTargetSceneId] = useState("");
  const [hotspotDescription, setHotspotDescription] = useState("");
  const [isSavingHotspot, setIsSavingHotspot] = useState(false);
  const [hotspotError, setHotspotError] = useState<string | null>(null);

  // New Scene Form state
  const [showAddScene, setShowAddScene] = useState(false);
  const [newSceneName, setNewSceneName] = useState("");
  const [newSceneAssetId, setNewSceneAssetId] = useState("");
  const [isAddingScene, setIsAddingScene] = useState(false);

  // General state
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);

  const activeScene = scenes.find((s) => s.id === activeSceneId) || scenes[0];

  // Callback when user clicks on 360 viewer to select coordinates
  const handleCoordSelect = useCallback(
    (coords: { pitch: number; yaw: number }) => {
      setSelectedPitch(coords.pitch);
      setSelectedYaw(coords.yaw);
      setHasPickedCoord(true);
    },
    []
  );

  // Refresh tour from backend API
  const refreshTour = useCallback(async () => {
    try {
      const res = await fetch(`/api/tours/${tour.id}`);
      if (res.ok) {
        const json = (await res.json()) as { code?: number; data?: { tour?: PanoramaTour } };
        if (json.code === 0 && json.data?.tour) {
          const t: PanoramaTour = json.data.tour;
          setTour(t);
          setScenes(t.scenes || []);
          onTourUpdated?.(t);
        }
      }
    } catch {
      // ignore
    }
  }, [tour.id, onTourUpdated]);

  // Handle Hotspot Submission
  const handleAddHotspot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeScene) return;
    if (!hotspotTitle.trim()) {
      setHotspotError("Vui lòng nhập tên điểm ghim");
      return;
    }
    if (hotspotType === "scene" && !hotspotTargetSceneId) {
      setHotspotError("Vui lòng chọn phòng chuyển đến");
      return;
    }

    setIsSavingHotspot(true);
    setHotspotError(null);

    try {
      const res = await fetch(`/api/tours/${tour.id}/hotspots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: activeScene.id,
          targetSceneId: hotspotType === "scene" ? hotspotTargetSceneId : null,
          type: hotspotType,
          pitch: selectedPitch,
          yaw: selectedYaw,
          title: hotspotTitle.trim(),
          description: hotspotDescription.trim() || null,
        }),
      });

      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok || json.error) {
        setHotspotError(json.message || "Không thể lưu điểm ghim");
        return;
      }

      // Reset form
      setHotspotTitle("");
      setHotspotDescription("");
      setHasPickedCoord(false);
      await refreshTour();
    } catch (err: unknown) {
      setHotspotError(err instanceof Error ? err.message : "Lỗi hệ thống");
    } finally {
      setIsSavingHotspot(false);
    }
  };

  // Handle Delete Hotspot
  const handleDeleteHotspot = async (hotspotId: string) => {
    if (!confirm("Bạn có chắc muốn xóa điểm ghim này không?")) return;

    try {
      const res = await fetch(`/api/tours/${tour.id}/hotspots?hotspotId=${encodeURIComponent(hotspotId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await refreshTour();
      }
    } catch {
      alert("Lỗi khi xóa điểm ghim");
    }
  };

  // Handle Add Scene
  const handleAddSceneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSceneName.trim() || !newSceneAssetId.trim()) return;

    setIsAddingScene(true);
    try {
      const res = await fetch(`/api/tours/${tour.id}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSceneName.trim(),
          assetId: newSceneAssetId.trim(),
          initialYaw: 0,
          initialPitch: 0,
          initialHfov: 100,
        }),
      });

      const json = (await res.json()) as { data?: { scene?: PanoramaScene }; message?: string };
      if (res.ok && json.data?.scene) {
        setNewSceneName("");
        setNewSceneAssetId("");
        setShowAddScene(false);
        await refreshTour();
        setActiveSceneId(json.data.scene.id);
      } else {
        alert(json.message || "Không thể thêm phòng mới");
      }
    } catch {
      alert("Lỗi khi thêm phòng mới");
    } finally {
      setIsAddingScene(false);
    }
  };

  // Handle Delete Scene
  const handleDeleteScene = async (sceneId: string) => {
    if (scenes.length <= 1) {
      alert("Tour cần ít nhất 1 căn phòng. Không thể xóa phòng duy nhất.");
      return;
    }
    if (!confirm("Xóa phòng này và toàn bộ các điểm ghim liên quan?")) return;

    try {
      const res = await fetch(`/api/tours/${tour.id}/scenes?sceneId=${encodeURIComponent(sceneId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await refreshTour();
        const remain = scenes.filter((s) => s.id !== sceneId);
        if (remain.length > 0) {
          setActiveSceneId(remain[0].id);
        }
      }
    } catch {
      alert("Lỗi khi xóa phòng");
    }
  };

  // Set default initial scene
  const handleSetFirstScene = async (sceneId: string) => {
    try {
      const res = await fetch(`/api/tours/${tour.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstSceneId: sceneId }),
      });
      if (res.ok) {
        await refreshTour();
      }
    } catch {
      alert("Lỗi khi cập nhật phòng mở màn");
    }
  };

  // Copy share link
  const origin = typeof window !== "undefined" ? window.location.origin : "https://design.7app.online";
  const shareUrl = `${origin}/tour/${encodeURIComponent(tour.shareToken)}`;
  const iframeCode = `<iframe src="${shareUrl}?embed=1" width="100%" height="600" frameborder="0" allow="accelerometer; gyroscope; vr; xr; fullscreen" style="border:0; border-radius:16px; overflow:hidden; box-shadow:0 8px 30px rgba(0,0,0,0.3);"></iframe>`;

  const copyLink = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const copyIframe = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(iframeCode);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = iframeCode;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedIframe(true);
      setTimeout(() => setCopiedIframe(false), 2000);
    } catch {
      setCopiedIframe(true);
      setTimeout(() => setCopiedIframe(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-2 backdrop-blur-md sm:p-6">
      <div className="flex h-full max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-brand-gold/30 bg-neutral-950 text-white shadow-2xl">
        {/* 1. Studio Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-neutral-900/80 px-6 py-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-gold/15 text-lg font-bold text-brand-gold">
              🏛️
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold tracking-tight text-white sm:text-lg">
                  {tour.title}
                </h2>
                <span className="rounded-md border border-brand-gold/40 bg-brand-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-gold">
                  Studio VR Editor
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                {scenes.length} không gian · {scenes.reduce((sum, s) => sum + (s.hotspots?.length || 0), 0)} điểm tương tác
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle Preview vs Editor */}
            <button
              type="button"
              onClick={() => setIsPreviewMode((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition ${
                isPreviewMode
                  ? "border-brand-gold bg-brand-gold text-black"
                  : "border-white/20 bg-white/5 text-white hover:bg-white/10"
              }`}
            >
              <span>{isPreviewMode ? "✏️ Quay lại chỉnh sửa" : "👁️ Xem trước (Preview)"}</span>
            </button>

            {/* Copy Share Link */}
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:border-brand-gold/50 hover:bg-white/10"
            >
              {copiedLink ? (
                <>
                  <span className="text-emerald-400">✓</span>
                  <span className="text-emerald-400">Đã chép link!</span>
                </>
              ) : (
                <>
                  <span>🔗</span>
                  <span>Link xem</span>
                </>
              )}
            </button>

            {/* Copy Iframe Embed */}
            <button
              type="button"
              onClick={copyIframe}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:border-brand-gold/50 hover:bg-white/10"
              title="Mã nhúng Iframe cho website"
            >
              {copiedIframe ? (
                <>
                  <span className="text-emerald-400">✓</span>
                  <span className="text-emerald-400">Đã chép Iframe!</span>
                </>
              ) : (
                <>
                  <span>&lt;/&gt;</span>
                  <span>Mã Iframe</span>
                </>
              )}
            </button>

            {/* Close Modal Button */}
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-full border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
        </header>

        {/* 2. Main Studio Body: 3D Canvas + Sidebar */}
        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          {/* 3D Canvas Left Pane */}
          <div className="relative flex flex-1 flex-col overflow-hidden bg-black">
            {scenes.length > 0 ? (
              <PanoramaTourViewer
                scenes={scenes}
                initialSceneId={activeSceneId}
                onSceneChange={(id) => setActiveSceneId(id)}
                isPickingCoord={!isPreviewMode && isPickingCoord}
                pickingPrompt="Click lên ảnh 360 để lấy tọa độ ghim điểm chuyển phòng / ghi chú"
                onCoordSelect={handleCoordSelect}
                previewCoord={
                  hasPickedCoord
                    ? {
                        pitch: selectedPitch,
                        yaw: selectedYaw,
                        title: hotspotTitle || "Điểm đang chọn",
                      }
                    : null
                }
                className="h-full w-full"
                showControls={true}
                showThumbnails={true}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-neutral-500">
                Chưa có không gian 360 nào trong tour. Hãy thêm phòng mới ở bảng bên phải.
              </div>
            )}
          </div>

          {/* Editor Right Sidebar */}
          {!isPreviewMode && (
            <aside className="w-full border-t border-white/10 bg-neutral-900/95 p-5 backdrop-blur-md overflow-y-auto lg:w-96 lg:border-t-0 lg:border-l">
              {/* Scene Switcher & Room Header */}
              <div className="mb-5 pb-4 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-gold">
                    Phòng đang chọn
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddScene((prev) => !prev)}
                    className="text-xs font-semibold text-brand-gold hover:underline"
                  >
                    {showAddScene ? "Đóng form" : "+ Thêm phòng mới"}
                  </button>
                </div>

                {/* Add Scene Inline Form */}
                {showAddScene ? (
                  <form onSubmit={handleAddSceneSubmit} className="mt-3 rounded-2xl border border-brand-gold/30 bg-black/50 p-3 text-xs">
                    <p className="font-bold text-white mb-2">Thêm không gian 360 mới</p>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] text-neutral-400 mb-1">Tên phòng</label>
                        <input
                          type="text"
                          required
                          placeholder="Ví dụ: Phòng ngủ Master"
                          value={newSceneName}
                          onChange={(e) => setNewSceneName(e.target.value)}
                          className="w-full rounded-lg border border-white/15 bg-neutral-800 px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-400 mb-1">Ảnh đại diện 360° của phòng</label>
                        {newSceneAssetId ? (
                          (() => {
                            const selected = availableAssets.find((a) => a.id === newSceneAssetId);
                            const isPano = selected ? isLikelyPanorama(selected) : false;
                            return (
                              <div className="flex items-center gap-2.5 rounded-xl border border-brand-gold/40 bg-black/60 p-2">
                                <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-neutral-800">
                                  <img
                                    src={`/api/assets/${encodeURIComponent(newSceneAssetId)}/download?inline=1`}
                                    alt={selected?.name || "Asset"}
                                    className="size-full object-cover"
                                  />
                                  {isPano && (
                                    <span className="absolute bottom-0.5 left-0.5 rounded-xs bg-black/80 px-1 text-[7px] font-bold text-brand-gold">
                                      360°
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-bold text-white">
                                    {selected?.name || `Asset ${newSceneAssetId.slice(0, 12)}`}
                                  </p>
                                  <p className="text-[9px]">
                                    {isPano ? (
                                      <span className="font-semibold text-green-400">✅ Chuẩn 360° Panorama</span>
                                    ) : (
                                      <span className="text-yellow-400">⚠️ Ảnh 2D</span>
                                    )}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setIsAssetPickerOpen(true)}
                                  className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold text-white hover:bg-white/20"
                                >
                                  Đổi ảnh
                                </button>
                              </div>
                            );
                          })()
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIsAssetPickerOpen(true)}
                            className="group flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-neutral-800/80 p-3 transition hover:border-brand-gold/50 hover:bg-brand-gold/5"
                          >
                            <span className="text-base">🖼️</span>
                            <span className="text-xs font-bold text-white group-hover:text-brand-gold">
                              + Chọn ảnh từ Thư Viện (Có xem trước)
                            </span>
                          </button>
                        )}
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowAddScene(false)}
                          className="rounded-lg border border-white/15 px-3 py-1 text-neutral-400 hover:text-white"
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          disabled={isAddingScene}
                          className="rounded-lg bg-brand-gold px-3 py-1 font-bold text-black hover:bg-brand-gold/90"
                        >
                          {isAddingScene ? "Đang thêm..." : "Thêm phòng"}
                        </button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        {activeScene?.name || "Chưa chọn phòng"}
                      </h3>
                      <p className="text-[11px] text-neutral-400">
                        {tour.firstSceneId === activeScene?.id ? "⭐ Phòng mở màn mặc định" : "Phòng phụ"}
                      </p>
                    </div>
                    {activeScene && (
                      <div className="flex items-center gap-1.5">
                        {tour.firstSceneId !== activeScene.id && (
                          <button
                            type="button"
                            onClick={() => handleSetFirstScene(activeScene.id)}
                            className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-semibold text-white/80 hover:border-brand-gold/40 hover:text-brand-gold"
                            title="Đặt phòng này xuất hiện đầu tiên khi khách mở tour"
                          >
                            ⭐ Đặt mở màn
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteScene(activeScene.id)}
                          className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-400 hover:bg-red-500/20"
                          title="Xóa phòng này"
                        >
                          Xóa phòng
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Hotspot Pinning Form */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-gold">
                    Ghim điểm tương tác (Hotspot)
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsPickingCoord((prev) => !prev)}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                      isPickingCoord ? "bg-brand-gold text-black" : "bg-white/10 text-white/70"
                    }`}
                  >
                    {isPickingCoord ? "🎯 Đang chờ click" : "Tạm tắt click"}
                  </button>
                </div>

                <form onSubmit={handleAddHotspot} className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
                  {/* Coords Badge */}
                  <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs">
                    <span className="text-neutral-400">Tọa độ góc nhìn:</span>
                    <span className="font-mono font-bold text-brand-gold">
                      Pitch: {selectedPitch.toFixed(1)}° · Yaw: {selectedYaw.toFixed(1)}°
                    </span>
                  </div>

                  {/* Hotspot Type Switcher */}
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setHotspotType("scene")}
                      className={`rounded-lg py-1.5 font-bold transition ${
                        hotspotType === "scene" ? "bg-brand-gold text-black shadow-sm" : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      🚪 Cổng chuyển phòng
                    </button>
                    <button
                      type="button"
                      onClick={() => setHotspotType("info")}
                      className={`rounded-lg py-1.5 font-bold transition ${
                        hotspotType === "info" ? "bg-brand-gold text-black shadow-sm" : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      ℹ️ Ghi chú vật liệu
                    </button>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1">
                      {hotspotType === "scene" ? "Tên hiển thị điểm chuyển" : "Tiêu đề ghi chú"}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={hotspotType === "scene" ? "Ví dụ: Đi sang Phòng Khách" : "Ví dụ: Gạch vân đá Marquina"}
                      value={hotspotTitle}
                      onChange={(e) => setHotspotTitle(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-neutral-800/80 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-brand-gold focus:outline-hidden"
                    />
                  </div>

                  {/* Target Scene (if scene hotspot) */}
                  {hotspotType === "scene" && (
                    <div>
                      <label className="block text-[10px] text-neutral-400 mb-1">Chuyển đến phòng nào?</label>
                      <select
                        required
                        value={hotspotTargetSceneId}
                        onChange={(e) => setHotspotTargetSceneId(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-neutral-800/80 px-3 py-2 text-xs text-white focus:border-brand-gold focus:outline-hidden"
                      >
                        <option value="">-- Chọn phòng đích --</option>
                        {scenes
                          .filter((s) => s.id !== activeScene?.id)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  {/* Description (if info hotspot) */}
                  {hotspotType === "info" && (
                    <div>
                      <label className="block text-[10px] text-neutral-400 mb-1">Mô tả vật liệu / ghi chú kiến trúc</label>
                      <textarea
                        rows={2}
                        placeholder="Ví dụ: Gỗ Óc Chó tự nhiên sơn PU bóng mờ, xuất xứ Bắc Mỹ."
                        value={hotspotDescription}
                        onChange={(e) => setHotspotDescription(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-neutral-800/80 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-brand-gold focus:outline-hidden"
                      />
                    </div>
                  )}

                  {hotspotError && (
                    <p className="text-xs text-red-400 font-semibold">{hotspotError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={isSavingHotspot}
                    className="w-full rounded-xl bg-gradient-to-r from-brand-gold via-brand-highlight to-brand-gold py-2.5 text-xs font-bold text-black shadow-md transition hover:opacity-95"
                  >
                    {isSavingHotspot ? "Đang lưu điểm..." : "📍 Ghim điểm này lên ảnh 360"}
                  </button>
                </form>
              </div>

              {/* Hotspots List on Current Scene */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                  Điểm ghim trong phòng này ({activeScene?.hotspots?.length || 0})
                </span>

                {(!activeScene?.hotspots || activeScene.hotspots.length === 0) ? (
                  <p className="mt-2 text-xs italic text-neutral-500">
                    Chưa có điểm ghim nào. Hãy click lên ảnh 360 để thêm điểm kết nối.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {activeScene.hotspots.map((hs: PanoramaHotspot) => {
                      const targetRoom = scenes.find((s) => s.id === hs.targetSceneId);
                      return (
                        <div
                          key={hs.id}
                          className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs transition hover:border-brand-gold/30"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span>{hs.type === "scene" ? "🚪" : "ℹ️"}</span>
                            <div className="truncate">
                              <p className="font-bold text-white truncate">{hs.title}</p>
                              <p className="text-[10px] text-neutral-400 truncate">
                                {hs.type === "scene"
                                  ? `Chuyển tới: ${targetRoom?.name || "Phòng"}`
                                  : hs.description || "Ghi chú"}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteHotspot(hs.id)}
                            className="ml-2 flex size-6 shrink-0 items-center justify-center rounded-md border border-red-500/20 text-red-400 hover:bg-red-500/20"
                            title="Xóa điểm này"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Visual Asset Picker Modal */}
      <AssetPickerModal
        isOpen={isAssetPickerOpen}
        onClose={() => setIsAssetPickerOpen(false)}
        assets={availableAssets}
        selectedAssetId={newSceneAssetId}
        onSelect={(asset) => {
          setNewSceneAssetId(asset.id);
          if (!newSceneName.trim()) {
            const nameLower = (asset.name || "").toLowerCase();
            if (nameLower.includes("living") || nameLower.includes("khach")) {
              setNewSceneName("Phòng Khách");
            } else if (nameLower.includes("bed") || nameLower.includes("ngu")) {
              setNewSceneName("Phòng Ngủ");
            } else if (nameLower.includes("kitchen") || nameLower.includes("bep")) {
              setNewSceneName("Phòng Bếp");
            } else if (nameLower.includes("bath") || nameLower.includes("ve-sinh")) {
              setNewSceneName("Phòng Tắm");
            } else {
              setNewSceneName(asset.name || "Phòng mới");
            }
          }
        }}
      />
    </div>
  );
}
