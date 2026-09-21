"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "./workspace-context";

export function CreateWorkspaceModal() {
  const { createWorkspaceModalOpen, setCreateWorkspaceModalOpen, refreshWorkspaces, setActiveWorkspaceId } =
    useWorkspace();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (loading) return;
    setCreateWorkspaceModalOpen(false);
    setName("");
    setSlug("");
    setError(null);
  }, [loading, setCreateWorkspaceModalOpen]);

  // Handle Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && createWorkspaceModalOpen) {
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createWorkspaceModalOpen, handleClose]);

  if (!createWorkspaceModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Vui lòng nhập tên Không gian làm việc / Studio");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() || undefined }),
      });

      const json = (await res.json()) as any;
      if (!res.ok || json.code !== 0) {
        throw new Error(json.message || json.error || "Không thể tạo workspace");
      }

      await refreshWorkspaces();
      if (json.data?.workspace?.id) {
        setActiveWorkspaceId(json.data.workspace.id);
      }
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi khi tạo workspace");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Tạo Không Gian Làm Việc Studio"
    >
      <div
        className="relative w-full max-w-md bg-stone-900 border border-amber-500/30 rounded-2xl p-6 text-stone-100 shadow-2xl shadow-black/80"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-white p-1 rounded-lg transition"
          aria-label="Đóng"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-stone-950 font-bold text-lg shadow-lg shadow-amber-500/20">
            🏢
          </div>
          <div>
            <h3 className="text-lg font-bold text-amber-300">Tạo Studio Workspace</h3>
            <p className="text-xs text-stone-400">Không gian làm việc & chia sẻ credits cho nhóm kiến trúc</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-300 mb-1.5 uppercase tracking-wider">
              Tên Studio / Công Ty Thiết Kế <span className="text-amber-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: ArchVibe Design Studio, Minimalist House..."
              className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none transition"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-300 mb-1.5 uppercase tracking-wider">
              Định danh URL (Slug - Tùy chọn)
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="VD: archvibe-studio"
              className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none transition"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-xs font-medium text-stone-400 hover:text-stone-200 transition"
              disabled={loading}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-bold text-xs tracking-wide shadow-lg shadow-amber-500/20 disabled:opacity-50 transition"
            >
              {loading ? "Đang tạo..." : "Tạo Studio Mới"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
