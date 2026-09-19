"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { BatchRenderJob, BatchItemPayload } from "@/lib/batch/types";
import { useWorkspace } from "@/components/workspaces/workspace-context";

interface BatchRenderModalProps {
  open: boolean;
  onClose: () => void;
  onOpenPitchDeck?: () => void;
}

const DEFAULT_ROOM_OPTIONS = [
  "Phòng khách",
  "Phòng ngủ Master",
  "Bếp - Ăn",
  "Phòng ngủ nhỏ",
  "Phòng tắm Master",
  "Ban công & Logia",
  "Phòng làm việc",
  "Phòng thay đồ (Walk-in Closet)",
];

const PRESET_STYLES = [
  { id: "scandinavian", name: "Scandinavian Warm", desc: "Gỗ sồi ấm, tường trắng kem, ánh sáng ngập tràn" },
  { id: "japandi", name: "Japandi Calm", desc: "Tối giản Nhật Bản kết hợp Bắc Âu, vật liệu mộc" },
  { id: "luxury", name: "Modern Luxury", desc: "Đá marble, viền kim loại ánh vàng, ánh sáng 3000K sang trọng" },
  { id: "wabisabi", name: "Wabi-Sabi Organic", desc: "Bê tông mài, thạch cao thô, đường cong tự nhiên" },
  { id: "minimalist", name: "Warm Minimalist", desc: "Đường nét gãy gọn, hệ tủ phẳng âm tường, không rác mắt" },
];

export function BatchRenderModal({ open, onClose, onOpenPitchDeck }: BatchRenderModalProps) {
  const { activeWorkspace } = useWorkspace();

  const [batchName, setBatchName] = useState("Thiết kế Căn Hộ Trọn Gói");
  const [selectedStyle, setSelectedStyle] = useState(PRESET_STYLES[0]);
  const [rooms, setRooms] = useState<Array<{ id: string; roomType: string; promptAddition: string }>>([
    { id: "1", roomType: "Phòng khách", promptAddition: "Tập trung sofa nỉ ấm và kệ tivi gỗ tự nhiên" },
    { id: "2", roomType: "Phòng ngủ Master", promptAddition: "Đầu giường ốp nỉ, ánh sáng gián tiếp êm dịu" },
    { id: "3", roomType: "Bếp - Ăn", promptAddition: "Hệ tủ bếp kịch trần, bàn ăn 6 ghế mặt đá" },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [activeJob, setActiveJob] = useState<BatchRenderJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll progress if job is active
  useEffect(() => {
    if (!activeJob || activeJob.status === "completed" || activeJob.status === "failed") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/batch-render/${activeJob.id}`);
        const json = (await res.json()) as any;
        if (res.ok && json.code === 0 && json.data?.batch) {
          setActiveJob(json.data.batch);
        }
      } catch {
        // ignore network error
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJob]);

  const handleAddRoom = () => {
    if (rooms.length >= 8) return;
    const nextRoomName =
      DEFAULT_ROOM_OPTIONS.find((opt) => !rooms.some((r) => r.roomType === opt)) ||
      `Phòng góc ${rooms.length + 1}`;
    setRooms((prev) => [
      ...prev,
      { id: String(Date.now()), roomType: nextRoomName, promptAddition: "" },
    ]);
  };

  const handleRemoveRoom = (id: string) => {
    if (rooms.length <= 1) return;
    setRooms((prev) => prev.filter((r) => r.id !== id));
  };

  const handleStartBatch = async () => {
    setSubmitting(true);
    setError(null);

    const items: BatchItemPayload[] = rooms.map((r) => ({
      scene: "interior",
      roomType: r.roomType,
      prompt: `Phong cách: ${selectedStyle.name}. Mô tả phong cách: ${selectedStyle.desc}. Chi tiết phòng: ${r.roomType}. Ghi chú riêng: ${r.promptAddition || "tiêu chuẩn photorealistic 4K, ánh sáng kiến trúc hài hòa."}`,
    }));

    try {
      const res = await fetch("/api/ai/batch-render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: batchName,
          workspaceId: activeWorkspace?.id,
          items,
          provider: "fal", // Ultra fast & cost-efficient Fal.ai Flux engine
        }),
      });

      const json = (await res.json()) as any;
      if (!res.ok || json.code !== 0) {
        throw new Error(json.message || json.error || "Không thể khởi động batch render");
      }

      setActiveJob(json.data.batch);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi khi kích hoạt render");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-3xl bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 text-stone-100 shadow-2xl shadow-black max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-stone-400 hover:text-white p-1 rounded-lg transition"
          aria-label="Đóng"
        >
          ✕
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-stone-800">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-stone-950 font-bold text-xl shadow-lg shadow-amber-500/20">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-stone-100">Batch AI Render Căn Hộ (Hàng Loạt)</h2>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Tối Đa 8 Phòng
              </span>
            </div>
            <p className="text-xs text-stone-400 mt-0.5">
              Render đồng bộ phong cách kiến trúc cả căn hộ qua hàng đợi siêu tốc Fal.ai Flux & Cloudflare
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* View 1: Active Job Progress Tracker */}
        {activeJob ? (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-stone-950 border border-amber-500/30">
              <div className="flex items-center justify-between mb-2 text-xs">
                <span className="font-bold text-amber-300">
                  {activeJob.name} ({activeJob.completedItems}/{activeJob.totalItems} phòng hoàn thành)
                </span>
                <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-800 text-stone-300">
                  {activeJob.status}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2.5 rounded-full bg-stone-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                  style={{
                    width: `${Math.round(
                      ((activeJob.completedItems + activeJob.failedItems) /
                        activeJob.totalItems) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Room Cards Progress Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[42vh] overflow-y-auto pr-1">
              {activeJob.items?.map((item, idx) => (
                <div
                  key={item.taskId}
                  className="p-3.5 rounded-2xl bg-stone-950 border border-stone-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-stone-800 flex items-center justify-center font-bold text-stone-300 text-[11px]">
                      {idx + 1}
                    </span>
                    <div>
                      <span className="font-bold text-stone-100">{item.roomType}</span>
                      <p className="text-[10px] text-stone-400 truncate max-w-[180px]">{item.prompt}</p>
                    </div>
                  </div>

                  <div>
                    {item.status === "ready" || item.status === "notified" ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-bold text-[10px]">
                        ✓ Xong
                      </span>
                    ) : item.status === "failed" || item.status === "expired" ? (
                      <span className="px-2 py-0.5 rounded-full bg-red-950/80 border border-red-500/40 text-red-300 font-bold text-[10px]">
                        Hoàn 1 credit
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-300 font-bold text-[10px] animate-pulse">
                        Đang gen...
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions when completed */}
            <div className="flex items-center justify-between pt-4 border-t border-stone-800">
              <button
                type="button"
                onClick={() => setActiveJob(null)}
                className="px-4 py-2 rounded-xl border border-stone-700 text-xs text-stone-300 hover:text-white transition"
              >
                Tạo Batch Mới
              </button>

              {onOpenPitchDeck && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPitchDeck();
                  }}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-md shadow-amber-500/20 transition flex items-center gap-2"
                >
                  <span>📑 Xuất Hồ Sơ PDF Pitch Deck Căn Hộ</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* View 2: Configure New Batch */
          <div className="space-y-6">
            {/* Batch Name & Style Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1.5">Tên Căn Hộ / Dự Án</label>
                <input
                  type="text"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1.5">Phong Cách Đồng Bộ</label>
                <select
                  value={selectedStyle.id}
                  onChange={(e) => {
                    const found = PRESET_STYLES.find((s) => s.id === e.target.value);
                    if (found) setSelectedStyle(found);
                  }}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 outline-none focus:border-amber-500"
                >
                  {PRESET_STYLES.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} — {st.desc}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Room List Configuration */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                  Danh Sách Phòng Căn Hộ ({rooms.length}/8)
                </label>
                {rooms.length < 8 && (
                  <button
                    type="button"
                    onClick={handleAddRoom}
                    className="text-xs text-amber-400 hover:text-amber-300 font-bold transition flex items-center gap-1"
                  >
                    <span>+ Thêm góc phòng</span>
                  </button>
                )}
              </div>

              <div className="space-y-2.5 max-h-[35vh] overflow-y-auto pr-1">
                {rooms.map((room, idx) => (
                  <div
                    key={room.id}
                    className="p-3 rounded-2xl bg-stone-950 border border-stone-800/80 flex items-center gap-3 text-xs"
                  >
                    <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-[11px]">
                      {idx + 1}
                    </span>

                    <input
                      type="text"
                      value={room.roomType}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRooms((prev) =>
                          prev.map((r) => (r.id === room.id ? { ...r, roomType: val } : r))
                        );
                      }}
                      className="w-36 bg-stone-900 border border-stone-700/80 rounded-lg px-2.5 py-1 text-stone-100 font-semibold outline-none"
                    />

                    <input
                      type="text"
                      placeholder="Ghi chú thêm (ví dụ: ban công nhìn về hướng Tây, nhiều cây xanh)..."
                      value={room.promptAddition}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRooms((prev) =>
                          prev.map((r) => (r.id === room.id ? { ...r, promptAddition: val } : r))
                        );
                      }}
                      className="flex-1 bg-stone-900 border border-stone-800 rounded-lg px-2.5 py-1 text-stone-300 placeholder-stone-600 outline-none"
                    />

                    {rooms.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRoom(room.id)}
                        className="text-stone-500 hover:text-red-400 p-1 transition"
                        title="Xóa phòng này"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Cost & Summary Footer */}
            <div className="p-4 rounded-2xl bg-stone-950 border border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                  Dự Toán Chi Phí Render Hàng Loạt
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-black text-amber-300">{rooms.length} credits</span>
                  <span className="text-xs text-stone-400">(1 credit/phòng • Động cơ Fal Flux)</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleStartBatch}
                disabled={submitting || rooms.length === 0}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-stone-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
              >
                {submitting ? "Đang xếp hàng..." : `⚡ Render Ngay ${rooms.length} Phòng`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
