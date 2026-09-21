"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { WorkspaceAuditLog, AuditAction } from "@/lib/audit/types";

interface WorkspaceAuditTabProps {
  workspaceId: string;
  userRole?: string;
}

type FilterCategory = "all" | "credits" | "renders" | "members";

export function WorkspaceAuditTab({ workspaceId, userRole }: WorkspaceAuditTabProps) {
  const [logs, setLogs] = useState<WorkspaceAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<number | undefined>(undefined);
  const [filter, setFilter] = useState<FilterCategory>("all");

  const isViewer = userRole === "viewer";

  const fetchLogs = useCallback(
    async (cursor?: number) => {
      if (isViewer) return;
      const isInitial = !cursor;
      if (isInitial) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        let url = `/api/workspaces/${workspaceId}/audit-logs?limit=15`;
        if (cursor) url += `&cursor=${cursor}`;

        if (filter === "credits") {
          url += `&action=CREDIT_ALLOCATED`;
        } else if (filter === "renders") {
          url += `&action=RENDER_TRIGGERED`;
        }

        const res = await fetch(url);
        const json = (await res.json()) as any;
        if (!res.ok || json.code !== 0) {
          throw new Error(json.message || "Không thể tải nhật ký hoạt động");
        }

        const fetchedLogs: WorkspaceAuditLog[] = json.data?.logs || [];
        setLogs((prev) => (isInitial ? fetchedLogs : [...prev, ...fetchedLogs]));
        setNextCursor(json.data?.nextCursor);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Lỗi tải nhật ký");
      } finally {
        if (isInitial) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [workspaceId, isViewer, filter]
  );

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (isViewer) {
    return (
      <div className="py-8 text-center text-stone-400 text-xs">
        <span className="text-xl block mb-2">🔒</span>
        Tài khoản vai trò <strong className="text-amber-300">Viewer</strong> không có quyền xem Nhật ký kiểm toán của Studio.
      </div>
    );
  }

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getActionBadge = (action: AuditAction) => {
    switch (action) {
      case "CREDIT_ALLOCATED":
        return {
          icon: "💰",
          label: "Nạp Credits",
          className: "bg-emerald-950/60 text-emerald-300 border-emerald-500/30",
        };
      case "RENDER_TRIGGERED":
        return {
          icon: "🎨",
          label: "Render Thiết Kế",
          className: "bg-amber-950/60 text-amber-300 border-amber-500/30",
        };
      case "RENDER_REFUNDED":
        return {
          icon: "↩️",
          label: "Hoàn Credits",
          className: "bg-blue-950/60 text-blue-300 border-blue-500/30",
        };
      case "MEMBER_INVITED":
        return {
          icon: "✉️",
          label: "Mời Thành Viên",
          className: "bg-purple-950/60 text-purple-300 border-purple-500/30",
        };
      case "MEMBER_JOINED":
        return {
          icon: "🤝",
          label: "Tham Gia Studio",
          className: "bg-indigo-950/60 text-indigo-300 border-indigo-500/30",
        };
      case "MEMBER_ROLE_CHANGED":
        return {
          icon: "🛡️",
          label: "Đổi Vai Trò",
          className: "bg-stone-800 text-stone-300 border-stone-700",
        };
      case "MEMBER_REMOVED":
        return {
          icon: "🚪",
          label: "Xóa Thành Viên",
          className: "bg-red-950/60 text-red-300 border-red-500/30",
        };
      default:
        return {
          icon: "📝",
          label: action,
          className: "bg-stone-800 text-stone-300 border-stone-700",
        };
    }
  };

  const renderDetails = (log: WorkspaceAuditLog) => {
    if (!log.details) return null;

    if (log.action === "CREDIT_ALLOCATED") {
      return (
        <span className="text-emerald-400 font-bold">
          +{Number(log.details.amount || 0)} credits
          {log.details.newWorkspaceAvailable !== undefined && (
            <span className="text-stone-400 font-normal ml-1.5 text-[11px]">
              (Số dư mới: {Number(log.details.newWorkspaceAvailable)})
            </span>
          )}
        </span>
      );
    }

    if (log.action === "RENDER_TRIGGERED") {
      return (
        <span className="text-amber-300">
          Góc phòng: <strong className="capitalize">{String(log.details.scene || "phòng")}</strong> • Chi phí: -{Number(log.details.cost || 1)} credit
        </span>
      );
    }

    if (log.action === "RENDER_REFUNDED") {
      return (
        <span className="text-blue-300">
          Hoàn trả +{Number(log.details.refundAmount || 1)} credit (Tác vụ không hoàn tất)
        </span>
      );
    }

    if (log.action === "MEMBER_INVITED") {
      return (
        <span className="text-purple-300">
          Mời email: <strong>{String(log.details.email)}</strong> (Vai trò: {String(log.details.role)})
        </span>
      );
    }

    if (log.action === "MEMBER_ROLE_CHANGED") {
      return (
        <span className="text-stone-300">
          Chuyển sang vai trò: <strong className="text-amber-300 uppercase">{String(log.details.newRole)}</strong>
        </span>
      );
    }

    return null;
  };

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-stone-950 border border-stone-800 text-xs">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded-lg transition font-medium ${
            filter === "all" ? "bg-amber-500 text-stone-950 font-bold" : "text-stone-400 hover:text-white"
          }`}
        >
          Tất cả
        </button>
        <button
          type="button"
          onClick={() => setFilter("credits")}
          className={`px-3 py-1 rounded-lg transition font-medium ${
            filter === "credits" ? "bg-amber-500 text-stone-950 font-bold" : "text-stone-400 hover:text-white"
          }`}
        >
          💰 Chi tiêu Credits
        </button>
        <button
          type="button"
          onClick={() => setFilter("renders")}
          className={`px-3 py-1 rounded-lg transition font-medium ${
            filter === "renders" ? "bg-amber-500 text-stone-950 font-bold" : "text-stone-400 hover:text-white"
          }`}
        >
          🎨 Render AI
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-stone-500 text-xs animate-pulse">
          Đang tải nhật ký kiểm toán Studio...
        </div>
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-stone-500 text-xs">
          Chưa có hoạt động nào được ghi nhận trong khoảng thời gian này.
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
          {logs.map((log) => {
            const badge = getActionBadge(log.action);
            return (
              <div
                key={log.id}
                className="p-3 rounded-2xl bg-stone-950/70 border border-stone-800/80 hover:border-stone-700 transition flex items-start justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-base select-none mt-0.5">{badge.icon}</span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className="font-semibold text-stone-200">
                        {log.actorName || log.actorEmail || "Thành viên"}
                      </span>
                    </div>

                    <div className="mt-1 text-stone-400">{renderDetails(log)}</div>
                  </div>
                </div>

                <div className="text-right text-[11px] text-stone-500 whitespace-nowrap">
                  {formatTimestamp(log.createdAt)}
                </div>
              </div>
            );
          })}

          {nextCursor && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => fetchLogs(nextCursor)}
                disabled={loadingMore}
                className="px-4 py-1.5 rounded-xl border border-stone-800 text-xs text-stone-300 hover:text-white hover:bg-stone-800 transition disabled:opacity-50"
              >
                {loadingMore ? "Đang tải thêm..." : "Xem lịch sử cũ hơn"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
