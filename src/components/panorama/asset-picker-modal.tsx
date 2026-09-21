"use client";

import { useState, useMemo } from "react";
import Image from "next/image";

export interface AssetItem {
  id: string;
  name?: string;
  mimeType?: string;
  createdAt?: number;
  isGenerated?: boolean;
  isSource?: boolean;
}

export interface AssetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: AssetItem) => void;
  assets: AssetItem[];
  selectedAssetId?: string;
}

/**
 * Kiểm tra xem asset có đặc điểm là ảnh Panorama 360 hay không
 * Dựa vào tên file, tiền tố prompt hoặc từ khóa thông dụng.
 */
export function isLikelyPanorama(asset: AssetItem): boolean {
  const name = (asset.name || "").toLowerCase();
  return (
    name.includes("pano") ||
    name.includes("360") ||
    name.includes("equirectangular") ||
    name.includes("sphere") ||
    name.includes("vr") ||
    name.includes("toan-canh")
  );
}

export function AssetPickerModal({
  isOpen,
  onClose,
  onSelect,
  assets,
  selectedAssetId,
}: AssetPickerModalProps) {
  const [activeFilter, setActiveFilter] = useState<"all" | "pano" | "generated" | "source">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewAsset, setPreviewAsset] = useState<AssetItem | null>(() => {
    return assets.find((a) => a.id === selectedAssetId) || assets[0] || null;
  });

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesSearch =
        !searchQuery.trim() ||
        (asset.name || asset.id).toLowerCase().includes(searchQuery.trim().toLowerCase());

      if (!matchesSearch) return false;

      if (activeFilter === "pano") {
        return isLikelyPanorama(asset);
      }
      if (activeFilter === "generated") {
        return Boolean(asset.isGenerated);
      }
      if (activeFilter === "source") {
        return Boolean(asset.isSource);
      }

      return true;
    });
  }, [assets, activeFilter, searchQuery]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (previewAsset) {
      onSelect(previewAsset);
      onClose();
    }
  };

  const isPreviewPano = previewAsset ? isLikelyPanorama(previewAsset) : false;

  const panoCount = assets.filter(isLikelyPanorama).length;
  const generatedCount = assets.filter((a) => a.isGenerated).length;
  const sourceCount = assets.filter((a) => a.isSource).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="flex h-[90vh] max-h-[720px] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-neutral-950 text-foreground shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🖼️</span>
              <h2 className="text-base font-bold text-white">Thư Viện Ảnh — Chọn Ảnh Cho VR Tour 360°</h2>
            </div>
            <p className="mt-0.5 text-xs text-neutral-400">
              Chọn ảnh góc rộng hoặc ảnh toàn cảnh 360° để đưa vào không gian ảo của công trình
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Filter Tabs & Search */}
        <div className="flex flex-col gap-3 border-b border-white/10 bg-white/5 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                activeFilter === "all"
                  ? "bg-brand-gold text-black shadow-md"
                  : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              Tất cả ({assets.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("pano")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                activeFilter === "pano"
                  ? "bg-brand-gold text-black shadow-md"
                  : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span>⭐</span>
              <span>Panorama 360° ({panoCount})</span>
            </button>
            {generatedCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveFilter("generated")}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  activeFilter === "generated"
                    ? "bg-brand-gold text-black shadow-md"
                    : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span>✨</span>
                <span>AI Hoàn Thành ({generatedCount})</span>
              </button>
            )}
            {sourceCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveFilter("source")}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  activeFilter === "source"
                    ? "bg-brand-gold text-black shadow-md"
                    : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span>📁</span>
                <span>Ảnh Gốc ({sourceCount})</span>
              </button>
            )}
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Tìm theo tên ảnh..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-neutral-900 px-3 py-1.5 pl-8 text-xs text-white placeholder-neutral-500 focus:border-brand-gold focus:outline-hidden sm:w-56"
            />
            <span className="absolute left-2.5 top-2 text-xs text-neutral-500">🔍</span>
          </div>
        </div>

        {/* Main Content: Left Grid + Right Preview */}
        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-12">
          {/* Left: Thumbnail Grid (7 cols) */}
          <div className="overflow-y-auto p-4 lg:col-span-7 border-r border-white/10">
            {filteredAssets.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center">
                <span className="text-3xl">🏜️</span>
                <p className="mt-2 text-xs font-bold text-neutral-300">Không tìm thấy ảnh phù hợp</p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  {activeFilter === "pano"
                    ? "Chưa có ảnh nào có từ khóa Panorama. Hãy chuyển sang tab 'Tất cả ảnh' để chọn."
                    : "Chưa có ảnh nào trong thư viện của bạn."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {filteredAssets.map((asset) => {
                  const isSelected = previewAsset?.id === asset.id;
                  const isPano = isLikelyPanorama(asset);

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setPreviewAsset(asset)}
                      className={`group relative flex flex-col overflow-hidden rounded-2xl border text-left transition ${
                        isSelected
                          ? "border-brand-gold bg-brand-gold/10 ring-2 ring-brand-gold/80"
                          : "border-white/10 bg-neutral-900 hover:border-white/30"
                      }`}
                    >
                      {/* Image Thumbnail */}
                      <div className="relative aspect-video w-full overflow-hidden bg-neutral-800">
                        <img
                          src={`/api/assets/${encodeURIComponent(asset.id)}/download?inline=1`}
                          alt={asset.name || "Asset"}
                          loading="lazy"
                          className="size-full object-cover transition group-hover:scale-105"
                          onError={(e) => {
                            // Fallback if image fails to load
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />

                        {/* Badges */}
                        <div className="absolute left-1.5 top-1.5 flex flex-col gap-1 items-start">
                          {isPano && (
                            <span className="rounded-md bg-black/85 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-brand-gold backdrop-blur-xs">
                              ⭐ 360° VR
                            </span>
                          )}
                          {asset.isGenerated && (
                            <span className="rounded-md bg-purple-900/85 px-1.5 py-0.5 text-[9px] font-bold text-purple-200 backdrop-blur-xs">
                              ✨ AI Done
                            </span>
                          )}
                          {asset.isSource && (
                            <span className="rounded-md bg-blue-900/85 px-1.5 py-0.5 text-[9px] font-bold text-blue-200 backdrop-blur-xs">
                              📷 Ảnh gốc
                            </span>
                          )}
                        </div>

                        {/* Selection Checkmark */}
                        {isSelected && (
                          <div className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-brand-gold text-black shadow-md">
                            <span className="text-[10px] font-black">✓</span>
                          </div>
                        )}
                      </div>

                      {/* Info Footer */}
                      <div className="p-2">
                        <p className="truncate text-[11px] font-semibold text-white">
                          {asset.name || `Ảnh ${asset.id.slice(0, 10)}`}
                        </p>
                        <p className="mt-0.5 text-[9px] text-neutral-400">
                          {asset.createdAt
                            ? new Date(asset.createdAt).toLocaleDateString("vi-VN")
                            : "Ảnh sẵn có"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Large Preview & Info (5 cols) */}
          <div className="flex flex-col justify-between overflow-y-auto bg-neutral-900/50 p-5 lg:col-span-5">
            {previewAsset ? (
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gold">
                    Xem Trước Hình Ảnh Đã Chọn
                  </span>
                  <h3 className="mt-1 text-sm font-bold text-white">
                    {previewAsset.name || `Asset ${previewAsset.id.slice(0, 16)}`}
                  </h3>
                </div>

                {/* Big Preview Image */}
                <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/15 bg-black shadow-lg">
                  <img
                    src={`/api/assets/${encodeURIComponent(previewAsset.id)}/download?inline=1`}
                    alt={previewAsset.name || "Preview"}
                    className="size-full object-contain"
                  />
                  {isPreviewPano && (
                    <div className="absolute bottom-2 left-2 rounded-lg bg-black/80 px-2 py-1 text-[10px] font-bold text-brand-gold backdrop-blur-xs">
                      🌐 Định dạng toàn cảnh 360° Equirectangular
                    </div>
                  )}
                </div>

                {/* Information Card & Guidelines */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400">Loại hiển thị:</span>
                    {isPreviewPano ? (
                      <span className="font-bold text-green-400">✅ Chuẩn Toàn Cảnh 360°</span>
                    ) : (
                      <span className="font-semibold text-yellow-400">⚠️ Ảnh phối cảnh 2D</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400">Mã Asset:</span>
                    <span className="font-mono text-[11px] text-neutral-300">
                      {previewAsset.id.slice(0, 18)}...
                    </span>
                  </div>

                  {/* Clarification Alert */}
                  {!isPreviewPano ? (
                    <div className="mt-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-2.5 text-[11px] text-yellow-300/90 leading-relaxed">
                      💡 <strong>Lưu ý:</strong> Đây là ảnh phối cảnh 2D thông thường. Bạn vẫn có thể đưa vào tour để xem dạng cầu, nhưng để có trải nghiệm không gian 360° không bị méo góc, KTS nên dùng ảnh Panorama tỉ lệ 2:1 (ví dụ tạo từ công cụ AI Mặt Bằng 3D).
                    </div>
                  ) : (
                    <div className="mt-2 rounded-xl border border-green-500/20 bg-green-500/10 p-2.5 text-[11px] text-green-300/90 leading-relaxed">
                      ✨ <strong>Hoàn hảo:</strong> Ảnh này hỗ trợ tương tác xoay 360°, ngắm trần/sàn và gắn các điểm chuyển phòng (Hotspot) mượt mà.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-neutral-500">
                <span className="text-4xl">👈</span>
                <p className="mt-2 text-xs">Nhấp vào một bức ảnh bên trái để xem trước chi tiết</p>
              </div>
            )}

            {/* Modal Bottom Actions */}
            <div className="mt-6 flex items-center justify-end gap-2 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-neutral-400 hover:text-white"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!previewAsset}
                className="rounded-xl bg-gradient-to-r from-brand-gold via-brand-highlight to-brand-gold px-5 py-2 text-xs font-bold text-black shadow-lg transition hover:opacity-90 disabled:opacity-50"
              >
                ✓ Xác Nhận Chọn Ảnh Này
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
