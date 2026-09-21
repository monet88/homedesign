"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth/session-stub";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { IconHousePlus, IconShield, IconSparkles } from "@/components/shell/icons";

interface InviteData {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: "architect" | "viewer";
  expiresAt: string;
}

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;
  const { user } = useSession();
  const { refreshWorkspaces, setActiveWorkspaceId } = useWorkspace();

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) return;
    async function loadInvite() {
      try {
        const res = await fetch(`/api/workspaces/invites/accept?token=${encodeURIComponent(token)}`);
        const json = (await res.json()) as any;
        if (!res.ok || json.code !== 0) {
          if (json.error === "INVITE_EXPIRED") {
            setError("Lời mời này đã hết hạn.");
          } else if (json.error === "INVITE_NOT_FOUND") {
            setError("Không tìm thấy lời mời hoặc lời mời đã được sử dụng.");
          } else {
            setError(json.message || "Không thể tải thông tin lời mời.");
          }
          return;
        }
        setInvite(json.data.invite);
      } catch {
        setError("Lỗi kết nối mạng khi kiểm tra lời mời.");
      } finally {
        setLoading(false);
      }
    }
    loadInvite();
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setError(null);

    try {
      const res = await fetch("/api/workspaces/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json()) as any;
      if (!res.ok || json.code !== 0) {
        throw new Error(json.message || json.error || "Chấp nhận lời mời thất bại.");
      }

      setSuccess(true);
      await refreshWorkspaces();
      if (json.data?.workspaceId) {
        setActiveWorkspaceId(json.data.workspaceId);
      }
      setTimeout(() => {
        router.push("/ai-interior-design");
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi khi tham gia.");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-amber-500/30 bg-card p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-stone-950 font-bold text-2xl shadow-lg shadow-amber-500/20 mb-4">
            🏢
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Lời Mời Gia Nhập Studio
          </h1>
          <p className="text-xs text-foreground/60 mt-1">
            Không gian làm việc nhóm & chia sẻ thư viện kiến trúc
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            <p className="text-xs text-foreground/60">Đang kiểm tra lời mời...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/30 text-center">
            <p className="text-sm font-semibold text-red-400 mb-1">Không thể tiếp tục</p>
            <p className="text-xs text-red-300/80 mb-4">{error}</p>
            <Link
              href="/"
              className="inline-block px-4 py-2 rounded-xl bg-foreground/10 hover:bg-foreground/20 text-xs font-semibold text-foreground transition"
            >
              Về trang chủ
            </Link>
          </div>
        ) : success ? (
          <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-center animate-fade-in">
            <p className="text-base font-bold text-emerald-400 mb-1">🎉 Chúc mừng bạn!</p>
            <p className="text-xs text-emerald-300/80 mb-2">
              Bạn đã gia nhập thành công studio <strong>{invite?.workspaceName}</strong>.
            </p>
            <p className="text-[11px] text-foreground/50">Đang chuyển hướng tới AI Studio...</p>
          </div>
        ) : invite ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-foreground/5 border border-border/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-foreground/60">Studio:</span>
                <span className="text-sm font-bold text-foreground">{invite.workspaceName}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-foreground/60">Vai trò của bạn:</span>
                <span className="inline-flex items-center gap-1 text-xs font-bold uppercase px-2 py-0.5 rounded-md bg-amber-500/20 text-brand-primary dark:text-amber-400">
                  <IconShield className="size-3" />
                  {invite.role}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground/60">Email được mời:</span>
                <span className="text-xs font-mono text-foreground/80">{invite.email}</span>
              </div>
            </div>

            {!user ? (
              <div className="space-y-3 pt-2">
                <p className="text-xs text-amber-500 text-center">
                  Vui lòng đăng nhập bằng tài khoản <strong>{invite.email}</strong> để chấp nhận lời mời.
                </p>
                <Link
                  href={`/sign-in?callbackUrl=/invite/${token}`}
                  className="w-full flex items-center justify-center py-2.5 rounded-xl bg-brand-primary text-white font-bold text-xs shadow-md transition hover:bg-brand-accent"
                >
                  Đăng Nhập Ngay
                </Link>
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition hover:from-amber-400 hover:to-amber-500 disabled:opacity-50"
                >
                  {accepting ? "Đang tham gia..." : "Chấp Nhận & Gia Nhập Studio"}
                </button>
                <p className="text-[11px] text-center text-foreground/50">
                  Sau khi tham gia, bạn có thể sinh ảnh bằng Quỹ Credits của Studio.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
