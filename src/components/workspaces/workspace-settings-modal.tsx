"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "./workspace-context";
import type { WorkspaceMember, WorkspaceInvite, WorkspaceRole } from "@/lib/workspaces/types";
import { WorkspaceAuditTab } from "./workspace-audit-tab";
import { WorkspaceBrandingTab } from "./workspace-branding-tab";

export function WorkspaceSettingsModal() {
  const { settingsModalOpen, setSettingsModalOpen, activeWorkspace, refreshWorkspaces, setActiveWorkspaceId } =
    useWorkspace();

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"members" | "audit" | "branding">("members");

  // Invite state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"architect" | "viewer">("architect");
  const [inviting, setInviting] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  // Credit allocation state
  const [allocateAmount, setAllocateAmount] = useState(10);
  const [allocating, setAllocating] = useState(false);

  const fetchDetails = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}`);
      if (!res.ok) return;
      const json = (await res.json()) as any;
      if (json.code === 0 && json.data?.workspace) {
        setMembers(json.data.workspace.members || []);
        setInvites(json.data.workspace.invites || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (settingsModalOpen && activeWorkspace?.id) {
      fetchDetails();
    }
  }, [settingsModalOpen, activeWorkspace?.id, fetchDetails]);

  const handleClose = useCallback(() => {
    setSettingsModalOpen(false);
    setError(null);
    setSuccess(null);
    setLastInviteLink(null);
  }, [setSettingsModalOpen]);

  // Escape key handler
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && settingsModalOpen) {
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsModalOpen, handleClose]);

  if (!settingsModalOpen || !activeWorkspace) return null;

  const isOwner = activeWorkspace.role === "owner";

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    setSuccess(null);
    setLastInviteLink(null);

    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const json = (await res.json()) as any;
      if (!res.ok || json.code !== 0) {
        throw new Error(json.message || json.error || "Gửi lời mời thất bại");
      }

      const link = `${window.location.origin}/invite/${json.data.invite.token}`;
      setLastInviteLink(link);
      setSuccess(`Đã tạo lời mời cho ${inviteEmail}!`);
      setInviteEmail("");
      await fetchDetails();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi khi gửi lời mời");
    } finally {
      setInviting(false);
    }
  };

  const handleAllocateCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (allocateAmount <= 0) return;
    setAllocating(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/credits/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: allocateAmount }),
      });
      const json = (await res.json()) as any;
      if (!res.ok || json.code !== 0) {
        throw new Error(json.message || json.error || "Không thể phân bổ credits");
      }

      setSuccess(`Đã nạp ${allocateAmount} credits vào Quỹ Studio!`);
      await refreshWorkspaces();
      await fetchDetails();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi phân bổ credits");
    } finally {
      setAllocating(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: "architect" | "viewer") => {
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        await fetchDetails();
        setSuccess("Đã cập nhật vai trò thành viên");
      }
    } catch {
      setError("Không thể đổi vai trò");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa thành viên này khỏi Studio?")) return;
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/members/${memberId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchDetails();
        setSuccess("Đã xóa thành viên");
      }
    } catch {
      setError("Không thể xóa thành viên");
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!confirm(`CẢNH BÁO: Bạn có chắc chắn muốn xóa toàn bộ Studio "${activeWorkspace.name}" không? Thao tác này không thể hoàn tác!`)) {
      return;
    }
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}`, { method: "DELETE" });
      if (res.ok) {
        setActiveWorkspaceId(null);
        await refreshWorkspaces();
        handleClose();
      }
    } catch {
      setError("Không thể xóa workspace");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Cài đặt Studio Workspace"
    >
      <div
        className="relative w-full max-w-2xl bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 text-stone-100 shadow-2xl shadow-black max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
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
            🏢
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-stone-100">{activeWorkspace.name}</h2>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {activeWorkspace.role}
              </span>
            </div>
            <p className="text-xs text-stone-400 mt-0.5">Quản lý thành viên, phân quyền và quỹ Credits chung</p>
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

        {/* Tabs Switcher */}
        <div className="flex items-center gap-2 mb-6 border-b border-stone-800 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("members")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === "members"
                ? "bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20"
                : "text-stone-400 hover:text-white"
            }`}
          >
            👥 Thành Viên & Quỹ Credits
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === "audit"
                ? "bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20"
                : "text-stone-400 hover:text-white"
            }`}
          >
            📜 Nhật Ký Hoạt Động
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("branding")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === "branding"
                ? "bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20"
                : "text-stone-400 hover:text-white"
            }`}
          >
            🎨 Thương Hiệu & Watermark
          </button>
        </div>

        {activeTab === "audit" ? (
          <WorkspaceAuditTab workspaceId={activeWorkspace.id} userRole={activeWorkspace.role} />
        ) : activeTab === "branding" ? (
          <WorkspaceBrandingTab workspaceId={activeWorkspace.id} userRole={activeWorkspace.role} />
        ) : (
          <>
            {/* Section: Shared Credit Pool */}
            <div className="mb-8 p-4 rounded-2xl bg-stone-950 border border-amber-500/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400/80">Quỹ Credits Chung (Shared Pool)</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-amber-300">{activeWorkspace.availableCredits ?? 0}</span>
                <span className="text-xs text-stone-400">credits có sẵn cho cả nhóm</span>
              </div>
            </div>

            {isOwner && (
              <form onSubmit={handleAllocateCredits} className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={allocateAmount}
                  onChange={(e) => setAllocateAmount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 bg-stone-900 border border-stone-700 rounded-xl px-2.5 py-1.5 text-xs text-stone-100 outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={allocating}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-md shadow-amber-500/10 disabled:opacity-50 transition whitespace-nowrap"
                >
                  {allocating ? "Đang nạp..." : "+ Nạp vào Quỹ"}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Section: Invite Member (Owner only) */}
        {isOwner && (
          <div className="mb-8 pb-6 border-b border-stone-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-300 mb-3">Mời Kiến Trúc Sư / Khách Xem</h3>
            <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="email"
                placeholder="Email đồng nghiệp / cộng tác viên..."
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 bg-stone-950 border border-stone-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-stone-100 placeholder-stone-600 outline-none"
                required
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "architect" | "viewer")}
                className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-200 outline-none"
              >
                <option value="architect">Architect (Thiết kế & Sinh ảnh)</option>
                <option value="viewer">Viewer (Chỉ xem dự án)</option>
              </select>
              <button
                type="submit"
                disabled={inviting}
                className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-100 text-xs font-semibold disabled:opacity-50 transition whitespace-nowrap"
              >
                {inviting ? "Đang gửi..." : "Tạo Lời Mời"}
              </button>
            </form>

            {lastInviteLink && (
              <div className="mt-3 p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-center justify-between gap-2">
                <span className="text-[11px] text-amber-200 truncate font-mono">{lastInviteLink}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(lastInviteLink);
                    alert("Đã sao chép link mời vào bộ nhớ tạm!");
                  }}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 text-stone-950 font-bold text-[10px] hover:bg-amber-400 transition whitespace-nowrap"
                >
                  Sao chép Link
                </button>
              </div>
            )}
          </div>
        )}

        {/* Section: Members List */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-300 mb-3">
            Thành Viên Trong Studio ({members.length})
          </h3>
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between p-3 rounded-xl bg-stone-950/60 border border-stone-800/80 hover:border-stone-700 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-stone-800 flex items-center justify-center font-bold text-xs text-stone-300 uppercase">
                    {m.name?.slice(0, 2) || m.email?.slice(0, 2) || "U"}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-stone-200">{m.name || "Chưa đặt tên"}</div>
                    <div className="text-[11px] text-stone-400">{m.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isOwner && m.role !== "owner" ? (
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.userId, e.target.value as "architect" | "viewer")}
                      className="bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-[11px] text-stone-300 outline-none"
                    >
                      <option value="architect">Architect</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                        m.role === "owner"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : m.role === "architect"
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                            : "bg-stone-800 text-stone-400"
                      }`}
                    >
                      {m.role}
                    </span>
                  )}

                  {isOwner && m.role !== "owner" && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(m.userId)}
                      className="text-stone-500 hover:text-red-400 p-1 transition"
                      title="Xóa thành viên"
                      aria-label="Xóa thành viên"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
          </>
        )}

        {/* Delete Studio (Owner only) */}
        {isOwner && (
          <div className="mt-8 pt-4 border-t border-stone-800/80 flex justify-between items-center">
            <span className="text-xs text-stone-500">Vùng nguy hiểm</span>
            <button
              type="button"
              onClick={handleDeleteWorkspace}
              className="text-xs text-red-400 hover:text-red-300 font-semibold transition"
            >
              Xóa Studio này
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
