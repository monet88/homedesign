"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import type { CustomPreset } from "@/lib/presets/custom-presets";

interface StudioPresetsModalProps {
  open: boolean;
  onClose: () => void;
  onPresetCreated?: (preset: CustomPreset) => void;
}

export function StudioPresetsModal({ open, onClose, onPresetCreated }: StudioPresetsModalProps) {
  const { activeWorkspace } = useWorkspace();
  const [presets, setPresets] = useState<CustomPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promptAdditions, setPromptAdditions] = useState("");
  const [scene, setScene] = useState<"interior" | "exterior" | "all">("interior");
  const [materials, setMaterials] = useState("");
  const [lightingStyle, setLightingStyle] = useState("");

  const loadPresets = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/presets/custom?workspaceId=${activeWorkspace.id}`);
      const json = (await res.json()) as any;
      if (json.code === 0 && Array.isArray(json.data?.presets)) {
        setPresets(json.data.presets);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (open && activeWorkspace?.id) {
      loadPresets();
    }
  }, [open, activeWorkspace?.id, loadPresets]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !activeWorkspace) return null;

  const currentRole = activeWorkspace.role;
  const canManage = currentRole === "owner" || currentRole === "architect";

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !promptAdditions.trim()) {
      setError("Vui lòng nhập Tên phong cách và Chỉ thị Prompt AI");
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);

    const matArray = materials
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/presets/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          name: name.trim(),
          description: description.trim() || undefined,
          customPromptAdditions: promptAdditions.trim(),
          scene,
          preferredMaterials: matArray,
          lightingStyle: lightingStyle.trim() || undefined,
        }),
      });

      const json = (await res.json()) as any;
      if (!res.ok || json.code !== 0) {
        throw new Error(json.message || json.error || "Không thể tạo preset");
      }

      setSuccess(`Đã tạo bộ phong cách "${name}" cho Studio!`);
      setName("");
      setDescription("");
      setPromptAdditions("");
      setMaterials("");
      setLightingStyle("");
      await loadPresets();
      if (onPresetCreated && json.data?.preset) {
        onPresetCreated(json.data.preset);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi khi tạo Preset");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (presetId: string) => {
    if (!confirm("Bạn có chắc muốn xóa bộ phong cách này khỏi Studio?")) return;
    try {
      const res = await fetch(`/api/presets/custom/${presetId}?workspaceId=${activeWorkspace.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await loadPresets();
        setSuccess("Đã xóa preset thành công");
      }
    } catch {
      setError("Lỗi khi xóa preset");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Studio Custom Styling Presets"
    >
      <div
        className="relative w-full max-w-2xl bg-stone-900 border border-amber-500/30 rounded-3xl p-6 sm:p-8 text-stone-100 shadow-2xl shadow-black max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-stone-400 hover:text-white p-1 rounded-lg transition"
          aria-label="Đóng"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-stone-800">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-stone-950 font-bold text-xl shadow-lg shadow-amber-500/20">
            🎨
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-100">Studio Custom Presets</h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Định hình nhận diện kiến trúc và phong cách vật liệu riêng của <strong>{activeWorkspace.name}</strong>
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
            <span>✅</span>
            <span>{success}</span>
          </div>
        )}

        {/* Create New Preset Form (Owner/Editor only) */}
        {canManage && (
          <form onSubmit={handleCreate} className="mb-8 p-4 rounded-2xl bg-stone-950 border border-amber-500/20 space-y-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
              + Tạo Bộ Phong Cách Mới Cho Studio
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-stone-300 mb-1">
                  Tên Preset <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="VD: Signature Indochine Luxury"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-stone-900 border border-stone-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-stone-100 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-300 mb-1">
                  Phạm vi áp dụng
                </label>
                <select
                  value={scene}
                  onChange={(e) => setScene(e.target.value as "interior" | "exterior" | "all")}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 outline-none"
                >
                  <option value="interior">Chỉ Nội Thất (Interior)</option>
                  <option value="exterior">Chỉ Ngoại Thất (Exterior)</option>
                  <option value="all">Cả Nội & Ngoại Thất (All)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-stone-300 mb-1">
                Chỉ thị Prompt AI (AI Style Directives) <span className="text-amber-400">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="VD: indochine aesthetics, rich dark teak wood, encaustic cement floor tiles, rattan chairs, brass light fittings..."
                value={promptAdditions}
                onChange={(e) => setPromptAdditions(e.target.value)}
                className="w-full bg-stone-900 border border-stone-800 focus:border-amber-500 rounded-xl p-3 text-xs text-stone-100 outline-none resize-none"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-stone-300 mb-1">
                  Vật liệu đặc trưng (cách nhau bởi dấu phẩy)
                </label>
                <input
                  type="text"
                  placeholder="VD: Gỗ Óc Chó, Đá Marble Calacatta, Kính sóng..."
                  value={materials}
                  onChange={(e) => setMaterials(e.target.value)}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-300 mb-1">
                  Ánh sáng đặc trưng
                </label>
                <input
                  type="text"
                  placeholder="VD: 2700K Warm Ambient, Golden Hour Sunlight..."
                  value={lightingStyle}
                  onChange={(e) => setLightingStyle(e.target.value)}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-bold text-xs shadow-md shadow-amber-500/20 disabled:opacity-50 transition"
              >
                {creating ? "Đang lưu..." : "Lưu Preset Vào Studio"}
              </button>
            </div>
          </form>
        )}

        {/* Presets List */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-300 mb-3">
            Các Bộ Phong Cách Của Studio ({presets.length})
          </h3>

          {loading ? (
            <div className="py-8 text-center text-xs text-stone-500">Đang tải presets...</div>
          ) : presets.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-500 border border-dashed border-stone-800 rounded-2xl">
              Chưa có Custom Preset nào trong Studio này.
            </div>
          ) : (
            <div className="space-y-3">
              {presets.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-2xl bg-stone-950/60 border border-stone-800/80 hover:border-amber-500/30 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-stone-100">{p.name}</span>
                      <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md bg-stone-800 text-amber-300">
                        {p.scene}
                      </span>
                    </div>
                    {p.description && <p className="text-xs text-stone-400">{p.description}</p>}
                    {p.customPromptAdditions && (
                      <p className="text-[11px] font-mono text-stone-500 line-clamp-1">
                        {p.customPromptAdditions}
                      </p>
                    )}
                    {p.preferredMaterials && p.preferredMaterials.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {p.preferredMaterials.map((m: string, idx: number) => (
                          <span
                            key={idx}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      className="self-end sm:self-center px-2.5 py-1 rounded-lg text-stone-500 hover:text-red-400 hover:bg-red-950/20 text-xs transition"
                    >
                      Xóa
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
