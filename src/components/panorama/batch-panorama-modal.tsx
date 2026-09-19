"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import type { PanoramaTour } from "@/lib/panorama/types";

interface BatchPanoramaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (tour: PanoramaTour) => void;
  workspaceId?: string | null;
  availableCredits?: number;
}

export interface RoomItem {
  id: string;
  name: string;
  roomType: string;
  customPrompt: string;
}

const PRESET_STYLES = [
  { id: "modern_luxury", name: "Modern Luxury", desc: "Đá marble, kim loại ánh vàng, ánh sáng 3000K sang trọng" },
  { id: "japandi", name: "Japandi Warm", desc: "Gỗ sồi mộc, tối giản Nhật Bản kết hợp Bắc Âu thanh tịnh" },
  { id: "indochine", name: "Indochine Heritage", desc: "Gạch bông hoài niệm, gỗ mun, tinh hoa Á Đông" },
  { id: "scandinavian", name: "Scandinavian Warm", desc: "Gỗ sáng, tường be ấm, ánh sáng tự nhiên ngập tràn" },
  { id: "wabi_sabi", name: "Wabi-Sabi Organic", desc: "Bê tông mài, vách thạch cao mộc mạc, đường cong mềm mại" },
  { id: "neoclassical", name: "Tân Cổ Điển", desc: "Phào chỉ tinh tế, đèn chùm pha lê, sang trọng quý phái" },
];

const PRESET_PALETTES = [
  "Gỗ Óc Chó Bắc Mỹ & Da Bò Ý",
  "Marble Calacatta & Kim Loại Vàng",
  "Gỗ Sồi Sáng & Vải Linen Be Ấm",
  "Bê Tông Mài & Kim Loại Đen Mờ",
  "Tùy chỉnh",
];

const QUICK_ROOM_TAGS = [
  { name: "Phòng Khách Skyview", roomType: "living_room" },
  { name: "Bếp & Quầy Bar Đảo", roomType: "kitchen" },
  { name: "Phòng Ngủ Master", roomType: "bedroom" },
  { name: "Phòng Ngủ Trẻ Em", roomType: "bedroom" },
  { name: "Ban Công Sky Garden", roomType: "balcony" },
  { name: "Phòng Tắm Master Spa", roomType: "bathroom" },
  { name: "Phòng Làm Việc & Đọc Sách", roomType: "office" },
  { name: "Phòng Thay Đồ Walk-in", roomType: "closet" },
];

export function BatchPanoramaModal({
  isOpen,
  onClose,
  onSuccess,
  workspaceId,
  availableCredits = 999,
}: BatchPanoramaModalProps) {
  const [tourTitle, setTourTitle] = useState("Căn Hộ Horizon Sky Villa");
  const [selectedStyle, setSelectedStyle] = useState(PRESET_STYLES[0]);
  const [selectedPalette, setSelectedPalette] = useState(PRESET_PALETTES[0]);
  const [customPalette, setCustomPalette] = useState("");
  const [autoLink, setAutoLink] = useState(true);

  const [rooms, setRooms] = useState<RoomItem[]>([
    {
      id: "1",
      name: "Phòng Khách Skyview",
      roomType: "living_room",
      customPrompt: "Sofa nỉ cao cấp, kệ tivi ốp đá marble, tầm nhìn kính kịch trần",
    },
    {
      id: "2",
      name: "Bếp & Quầy Bar Đảo",
      roomType: "kitchen",
      customPrompt: "Đảo bếp đá nhân tạo, hệ tủ kịch trần, thiết bị âm tủ sang trọng",
    },
    {
      id: "3",
      name: "Phòng Ngủ Master",
      roomType: "bedroom",
      customPrompt: "Giường bọc nệm lớn, vách ốp đầu giường gỗ vân xương cá, ánh sáng gián tiếp",
    },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeBatchJobId, setActiveBatchJobId] = useState<string | null>(null);
  const [createdTour, setCreatedTour] = useState<PanoramaTour | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    completed: number;
    total: number;
    status: string;
    items?: Array<{ roomType: string; status: string }>;
  } | null>(null);

  // Poll progress if batchJob is running
  useEffect(() => {
    if (!activeBatchJobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/batch-render/${activeBatchJobId}`);
        if (res.ok) {
          const json = (await res.json()) as {
            code?: number;
            data?: {
              batch?: {
                status: string;
                completedItems: number;
                totalItems: number;
                items?: Array<{ roomType: string; status: string }>;
              };
            };
          };

          const batch = json.data?.batch;
          if (batch) {
            setBatchProgress({
              completed: batch.completedItems,
              total: batch.totalItems,
              status: batch.status,
              items: batch.items,
            });

            if (batch.status === "completed" || batch.status === "partial") {
              clearInterval(interval);
              setSubmitting(false);
            }
          }
        }
      } catch {
        // ignore network error
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeBatchJobId]);

  if (!isOpen) return null;

  const totalCost = rooms.length;
  const isInsufficientCredits = availableCredits < totalCost;

  const handleAddRoom = (preset?: { name: string; roomType: string }) => {
    if (rooms.length >= 8) return;
    const name = preset ? preset.name : `Phòng ${rooms.length + 1}`;
    const roomType = preset ? preset.roomType : "living_room";

    setRooms((prev) => [
      ...prev,
      {
        id: String(Date.now() + Math.random()),
        name,
        roomType,
        customPrompt: "",
      },
    ]);
  };

  const handleRemoveRoom = (id: string) => {
    if (rooms.length <= 1) return;
    setRooms((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUpdateRoom = (id: string, updates: Partial<RoomItem>) => {
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const handleStartBatch = async () => {
    if (!tourTitle.trim()) {
      setError("Vui lòng nhập tên công trình / Tour");
      return;
    }

    setSubmitting(true);
    setError(null);

    const palette = selectedPalette === "Tùy chỉnh" ? customPalette : selectedPalette;

    try {
      const res = await fetch("/api/ai/batch-panorama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tourTitle: tourTitle.trim(),
          style: selectedStyle.name,
          palette,
          rooms: rooms.map((r) => ({
            name: r.name,
            roomType: r.roomType,
            customPrompt: r.customPrompt,
          })),
          autoLinkPortals: autoLink,
          workspaceId: workspaceId ?? undefined,
        }),
      });

      const json = (await res.json()) as {
        code?: number;
        data?: {
          tour: PanoramaTour;
          batchJobId: string;
          totalCreditsCost: number;
        };
        error?: string;
        message?: string;
      };

      if (!res.ok || json.code !== 0 || !json.data) {
        throw new Error(json.message || json.error || "Khởi tạo batch tour thất bại");
      }

      setCreatedTour(json.data.tour);
      setActiveBatchJobId(json.data.batchJobId);
      setBatchProgress({
        completed: 0,
        total: rooms.length,
        status: "processing",
      });

      if (onSuccess) {
        onSuccess(json.data.tour);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-zinc-950 border border-amber-500/30 shadow-2xl text-zinc-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-zinc-950 font-bold shadow-lg shadow-amber-500/20">
              🪄
            </div>
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">
                AI Batch 360° Panorama Studio Generator
              </h2>
              <p className="text-xs text-zinc-400">
                Khởi tạo trọn bộ không gian 360° căn hộ & tự động liên kết Tour VR chỉ với 1 cú click
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting && batchProgress?.status === "processing"}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
              <span className="text-lg">⚠️</span>
              <p>{error}</p>
            </div>
          )}

          {/* If Active Batch Progress is Running */}
          {activeBatchJobId && batchProgress ? (
            <div className="space-y-6 py-4">
              <div className="rounded-xl p-6 bg-zinc-900/80 border border-amber-500/30 text-center space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 text-amber-400 text-2xl animate-pulse">
                  {batchProgress.status === "completed" ? "✅" : "⚡"}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-100">
                    {batchProgress.status === "completed"
                      ? "Khởi Tạo Trọn Bộ Tour 360° Hoàn Tất!"
                      : "AI Đang Tiến Hành Render Toàn Bộ Căn Hộ 360°..."}
                  </h3>
                  <p className="text-sm text-zinc-400 mt-1">
                    Đã hoàn thành {batchProgress.completed} / {batchProgress.total} phòng
                  </p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-amber-300 h-full transition-all duration-500 rounded-full"
                    style={{
                      width: `${Math.round((batchProgress.completed / Math.max(batchProgress.total, 1)) * 100)}%`,
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 text-left text-xs">
                  {rooms.map((room, idx) => {
                    const isDone = (batchProgress.completed > idx);
                    return (
                      <div
                        key={room.id}
                        className={`p-3 rounded-lg border ${
                          isDone
                            ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
                            : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400"
                        }`}
                      >
                        <div className="font-semibold flex items-center justify-between">
                          <span>{room.name}</span>
                          <span>{isDone ? "✓ Xong" : "Đang chờ..."}</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1">360° Equirectangular</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {createdTour && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
                  <Link
                    href={`/tour/${createdTour.shareToken}`}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold text-center shadow-lg shadow-amber-500/20 transition-all"
                  >
                    🕶️ Chiêm Ngưỡng Tour VR 360° Ngay
                  </Link>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors"
                  >
                    Về Danh Sách Tour
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Tour Basic Information */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Tên Công Trình / Dự Án Kiến Trúc <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={tourTitle}
                    onChange={(e) => setTourTitle(e.target.value)}
                    placeholder="Ví dụ: Sky Villa Landmark 81, Căn Hộ Penthouse Horizon..."
                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-zinc-100 text-sm outline-none transition-all"
                  />
                </div>

                {/* Style Selection Cards */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Phong Cách Thiết Kế Đồng Bộ (Architectural Style)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {PRESET_STYLES.map((style) => {
                      const isSelected = selectedStyle.id === style.id;
                      return (
                        <button
                          type="button"
                          key={style.id}
                          onClick={() => setSelectedStyle(style)}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            isSelected
                              ? "bg-amber-500/10 border-amber-500 text-amber-300 ring-1 ring-amber-500/40"
                              : "bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                          }`}
                        >
                          <div className="font-semibold text-xs">{style.name}</div>
                          <div className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5">{style.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Palette Selection */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Bảng Màu & Vật Liệu Chủ Đạo (Color Palette & Materials)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_PALETTES.map((palette) => {
                      const isSelected = selectedPalette === palette;
                      return (
                        <button
                          type="button"
                          key={palette}
                          onClick={() => setSelectedPalette(palette)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            isSelected
                              ? "bg-amber-500 text-zinc-950 font-bold border-amber-400"
                              : "bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                          }`}
                        >
                          {palette}
                        </button>
                      );
                    })}
                  </div>
                  {selectedPalette === "Tùy chỉnh" && (
                    <input
                      type="text"
                      value={customPalette}
                      onChange={(e) => setCustomPalette(e.target.value)}
                      placeholder="Nhập vật liệu & màu sắc riêng (vd: Gỗ mun, kính xám khói, inox xước vàng)..."
                      className="mt-2 w-full px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 outline-none focus:border-amber-500"
                    />
                  )}
                </div>
              </div>

              {/* Room Matrix Selection */}
              <div className="border-t border-zinc-800 pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-200">
                      Danh Sách Phòng Căn Hộ ({rooms.length}/8)
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Tự động phân bổ góc nhìn và liên kết cửa chuyển phòng liền mạch
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddRoom()}
                    disabled={rooms.length >= 8}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs font-medium border border-zinc-700 transition-colors disabled:opacity-50"
                  >
                    + Thêm Phòng
                  </button>
                </div>

                {/* Quick Add Tags */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs text-zinc-400">
                  <span className="text-[11px] whitespace-nowrap text-zinc-500">Thêm nhanh:</span>
                  {QUICK_ROOM_TAGS.map((tag) => (
                    <button
                      key={tag.name}
                      type="button"
                      onClick={() => handleAddRoom(tag)}
                      disabled={rooms.length >= 8 || rooms.some((r) => r.name === tag.name)}
                      className="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] whitespace-nowrap text-zinc-300 disabled:opacity-40"
                    >
                      + {tag.name}
                    </button>
                  ))}
                </div>

                {/* Rooms List */}
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {rooms.map((room, index) => (
                    <div
                      key={room.id}
                      className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 flex flex-col gap-2 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="w-5 h-5 rounded-full bg-zinc-800 text-amber-400 text-xs flex items-center justify-center font-bold">
                            {index + 1}
                          </span>
                          <input
                            type="text"
                            value={room.name}
                            onChange={(e) => handleUpdateRoom(room.id, { name: e.target.value })}
                            className="bg-transparent font-medium text-sm text-zinc-100 border-b border-transparent hover:border-zinc-600 focus:border-amber-500 outline-none px-1"
                            placeholder="Tên phòng..."
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveRoom(room.id)}
                          disabled={rooms.length <= 1}
                          className="text-zinc-500 hover:text-rose-400 text-sm p-1 rounded transition-colors disabled:opacity-30"
                          title="Xóa phòng này"
                        >
                          🗑️
                        </button>
                      </div>

                      <input
                        type="text"
                        value={room.customPrompt}
                        onChange={(e) => handleUpdateRoom(room.id, { customPrompt: e.target.value })}
                        placeholder="Yêu cầu chi tiết (vd: view ban công nhìn ra hồ bơi, giường bọc nỉ xám...)"
                        className="w-full px-3 py-1.5 rounded-lg bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-300 placeholder-zinc-600 focus:border-zinc-700 outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Navigation Options */}
              <div className="border-t border-zinc-800 pt-4 flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoLink}
                    onChange={(e) => setAutoLink(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 bg-zinc-900 border-zinc-700 focus:ring-amber-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-zinc-200">
                      ⚡ Tự động liên kết mốc chuyển phòng (Auto-link Portals)
                    </span>
                    <p className="text-[11px] text-zinc-400">
                      Tự động cắm hotspot cửa đi lại giữa phòng khách và các phòng khác
                    </p>
                  </div>
                </label>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        {!activeBatchJobId && (
          <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/60 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-zinc-400 flex items-center gap-3">
              <span>
                Tổng số phòng: <strong className="text-zinc-200">{rooms.length}</strong>
              </span>
              <span className="text-zinc-600">•</span>
              <span>
                Chi phí ước tính:{" "}
                <strong className="text-amber-400 font-bold">{totalCost} Credits</strong>
              </span>
              {isInsufficientCredits && (
                <span className="text-rose-400 font-medium">(Số dư không đủ: {availableCredits})</span>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleStartBatch}
                disabled={submitting || isInsufficientCredits}
                className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 text-sm font-bold shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Đang Khởi Tạo...</span>
                  </>
                ) : (
                  <>
                    <span>🚀 Khởi Tạo Trọn Bộ Tour 360°</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
