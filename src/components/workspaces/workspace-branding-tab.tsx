"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { StudioBranding } from "@/lib/branding/types";

interface WorkspaceBrandingTabProps {
  workspaceId: string;
  userRole?: string;
}

export function WorkspaceBrandingTab({ workspaceId, userRole }: WorkspaceBrandingTabProps) {
  const [branding, setBranding] = useState<StudioBranding | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [brandName, setBrandName] = useState("");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [brandTagline, setBrandTagline] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactAddress, setContactAddress] = useState("");
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkPosition, setWatermarkPosition] = useState<"bottom-right" | "bottom-left" | "center">("bottom-right");
  const [watermarkOpacity, setWatermarkOpacity] = useState(40); // 40%

  const isOwner = userRole === "owner";

  const fetchBranding = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/branding`);
      const json = (await res.json()) as any;
      if (res.ok && json.code === 0 && json.data?.branding) {
        const b: StudioBranding = json.data.branding;
        setBranding(b);
        setBrandName(b.brandName || "");
        setBrandLogoUrl(b.brandLogoUrl || "");
        setBrandTagline(b.brandTagline || "");
        setContactPhone(b.contactPhone || "");
        setContactEmail(b.contactEmail || "");
        setContactAddress(b.contactAddress || "");
        setWatermarkEnabled(b.watermarkEnabled);
        setWatermarkText(b.watermarkText || "");
        setWatermarkPosition(b.watermarkPosition || "bottom-right");
        setWatermarkOpacity(Math.round((b.watermarkOpacity || 0.4) * 100));
      }
    } catch (err: unknown) {
      setError("Không thể tải thông tin thương hiệu");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/branding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: brandName.trim() || undefined,
          brandLogoUrl: brandLogoUrl.trim() || null,
          brandTagline: brandTagline.trim() || null,
          contactPhone: contactPhone.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactAddress: contactAddress.trim() || null,
          watermarkEnabled,
          watermarkText: watermarkText.trim() || undefined,
          watermarkPosition,
          watermarkOpacity: watermarkOpacity / 100,
        }),
      });

      const json = (await res.json()) as any;
      if (!res.ok || json.code !== 0) {
        throw new Error(json.message || json.error || "Không thể lưu thông tin thương hiệu");
      }

      setSuccess("Đã lưu cài đặt Thương hiệu & Bản quyền Watermark thành công!");
      await fetchBranding();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi khi lưu");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-stone-500 text-xs animate-pulse">
        Đang tải thông tin thương hiệu Studio...
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 text-xs">
      {error && (
        <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 flex items-center gap-2">
          <span>✅</span>
          <span>{success}</span>
        </div>
      )}

      {/* Brand Identity Section */}
      <div className="p-4 rounded-2xl bg-stone-950 border border-stone-800 space-y-4">
        <h3 className="font-bold uppercase tracking-wider text-amber-400 text-[11px]">
          1. Thông Tin Nhận Diện Studio
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="font-semibold text-stone-300 block mb-1">Tên Thương Hiệu Studio</label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="VD: Lux Interior & Architecture"
              disabled={!isOwner}
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 outline-none focus:border-amber-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="font-semibold text-stone-300 block mb-1">URL Logo Studio (PNG/SVG nền trong)</label>
            <input
              type="url"
              value={brandLogoUrl}
              onChange={(e) => setBrandLogoUrl(e.target.value)}
              placeholder="https://.../studio-logo.png"
              disabled={!isOwner}
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 outline-none focus:border-amber-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="font-semibold text-stone-300 block mb-1">Slogan / Định Vị</label>
            <input
              type="text"
              value={brandTagline}
              onChange={(e) => setBrandTagline(e.target.value)}
              placeholder="VD: Tinh hoa kiến trúc hiện đại"
              disabled={!isOwner}
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 outline-none focus:border-amber-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="font-semibold text-stone-300 block mb-1">Hotline / Số Điện Thoại</label>
            <input
              type="text"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="VD: 0908 123 456"
              disabled={!isOwner}
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 outline-none focus:border-amber-500 disabled:opacity-50"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="font-semibold text-stone-300 block mb-1">Địa Chỉ Văn Phòng / Showroom</label>
            <input
              type="text"
              value={contactAddress}
              onChange={(e) => setContactAddress(e.target.value)}
              placeholder="VD: Tòa nhà Landmark 81, Quận Bình Thạnh, TP. Hồ Chí Minh"
              disabled={!isOwner}
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 outline-none focus:border-amber-500 disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      {/* Watermark Section */}
      <div className="p-4 rounded-2xl bg-stone-950 border border-stone-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold uppercase tracking-wider text-amber-400 text-[11px]">
            2. Bản Quyền & Watermark Chìm Trên Ảnh 4K
          </h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={watermarkEnabled}
              onChange={(e) => setWatermarkEnabled(e.target.checked)}
              disabled={!isOwner}
              className="rounded bg-stone-900 border-stone-700 text-amber-500 focus:ring-0"
            />
            <span className="text-stone-300 font-semibold text-xs">Bật Watermark Bản Quyền</span>
          </label>
        </div>

        {watermarkEnabled && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="font-semibold text-stone-300 block mb-1">Chữ Watermark Chìm</label>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="VD: © LUXURY STUDIO • BẢN QUYỀN THIẾT KẾ"
                  disabled={!isOwner}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 outline-none focus:border-amber-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="font-semibold text-stone-300 block mb-1">Vị Trí Đóng Dấu</label>
                <select
                  value={watermarkPosition}
                  onChange={(e) => setWatermarkPosition(e.target.value as any)}
                  disabled={!isOwner}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 outline-none focus:border-amber-500 disabled:opacity-50"
                >
                  <option value="bottom-right">Góc Dưới Phải (Khuyên dùng)</option>
                  <option value="bottom-left">Góc Dưới Trái</option>
                  <option value="center">Chính Giữa Bản Vẽ</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-semibold text-stone-300">Độ Mờ (Opacity): {watermarkOpacity}%</label>
                <span className="text-[10px] text-stone-500">Độ mờ chuẩn để không che mất chi tiết bản vẽ</span>
              </div>
              <input
                type="range"
                min="15"
                max="85"
                value={watermarkOpacity}
                onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                disabled={!isOwner}
                className="w-full accent-amber-500"
              />
            </div>

            {/* Live Watermark Preview Box */}
            <div className="relative aspect-[16/9] w-full max-w-md mx-auto rounded-2xl overflow-hidden border border-stone-800 bg-stone-900 shadow-inner flex items-center justify-center select-none">
              <div className="absolute inset-0 bg-gradient-to-tr from-stone-950 via-stone-900 to-stone-800 flex items-center justify-center text-stone-700 text-xs italic">
                [Khung xem trước ảnh thiết kế 4K]
              </div>

              {/* Simulated Watermark */}
              <div
                className={`absolute p-4 text-xs font-black tracking-widest uppercase transition-all ${
                  watermarkPosition === "bottom-right"
                    ? "bottom-2 right-2 text-right"
                    : watermarkPosition === "bottom-left"
                    ? "bottom-2 left-2 text-left"
                    : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
                }`}
                style={{
                  color: `rgba(255, 255, 255, ${watermarkOpacity / 100})`,
                  textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                }}
              >
                {brandLogoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={brandLogoUrl}
                    alt="Logo preview"
                    className="h-6 mb-1 inline-block object-contain"
                    style={{ opacity: watermarkOpacity / 100 }}
                  />
                )}
                <div>{watermarkText || `© ${brandName || "STUDIO"} • BẢN QUYỀN THIẾT KẾ`}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {isOwner && (
        <div className="text-right pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-md shadow-amber-500/20 transition disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "💾 Lưu Thay Đổi Thương Hiệu"}
          </button>
        </div>
      )}
    </form>
  );
}
