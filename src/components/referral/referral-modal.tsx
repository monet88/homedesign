"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/context";

interface ReferralModalProps {
  open: boolean;
  onClose: () => void;
}

export function ReferralModal({ open, onClose }: ReferralModalProps) {
  const { lang } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    referralCode?: string;
    referralUrl?: string;
    clicks?: number;
    totalReferrals?: number;
    rewardedCredits?: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [claimStatus, setClaimStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
  }>({ loading: false });

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/referral/me")
      .then((res) => res.json())
      .then((res: any) => {
        if (res?.data) {
          setData(res.data);
        }
      })
      .catch((err) => console.error("Fetch referral stats error:", err))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleCopy = async () => {
    if (!data?.referralUrl) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(data.referralUrl);
      } else {
        const input = document.createElement("input");
        input.value = data.referralUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleManualClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCode.trim().toLowerCase();
    if (!clean) return;

    setClaimStatus({ loading: true });
    try {
      const res = await fetch("/api/referral/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string; code?: number };

      if (res.ok && data.success) {
        setClaimStatus({
          loading: false,
          success: true,
          message: isVi
            ? "Đã liên kết mã giới thiệu thành công!"
            : "Referral code applied successfully!",
        });
        setManualCode("");
      } else {
        let errMsg = isVi ? "Không thể áp dụng mã giới thiệu." : "Failed to apply referral code.";
        if (data.error === "INVALID_CODE") {
          errMsg = isVi ? "Mã giới thiệu không tồn tại." : "Invalid referral code.";
        } else if (data.error === "SELF_REFERRAL") {
          errMsg = isVi ? "Bạn không thể tự dùng mã của chính mình." : "You cannot refer yourself.";
        } else if (data.error === "ALREADY_REFERRED") {
          errMsg = isVi ? "Tài khoản của bạn đã được giới thiệu trước đó." : "Account is already referred.";
        }
        setClaimStatus({ loading: false, success: false, message: errMsg });
      }
    } catch {
      setClaimStatus({
        loading: false,
        success: false,
        message: isVi ? "Lỗi kết nối máy chủ." : "Network error, please try again.",
      });
    }
  };

  const isVi = lang === "vi";

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-8">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl border border-border bg-card p-2 text-foreground/60 hover:bg-muted transition-colors"
        >
          ✕
        </button>

        {/* Top Visual */}
        <div className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
          <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {isVi ? "Mời Bạn Bè — Nhận 10 Credits Miễn Phí" : "Invite Friends — Earn 10 Free Credits"}
        </h2>
        <p className="mt-1 text-xs text-foreground/70">
          {isVi
            ? "Chia sẻ link giới thiệu với đồng nghiệp, khách hàng và bạn bè kiến trúc để nhận thưởng."
            : "Share your unique invite link with friends and colleagues to earn free design credits."}
        </p>

        {/* Link Box */}
        <div className="mt-6 rounded-2xl border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              readOnly
              value={data?.referralUrl || "https://design.7app.online?ref=..."}
              className="w-full bg-transparent text-xs font-mono text-foreground focus:outline-none select-all"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-accent transition-all"
            >
              {copied
                ? (isVi ? "Đã sao chép!" : "Copied!")
                : (isVi ? "Sao chép" : "Copy")}
            </button>
          </div>
        </div>

        {/* How It Works (2-Phase Incentive) */}
        <div className="mt-6 space-y-3 rounded-2xl border border-brand-primary/20 bg-brand-primary/5 p-4 text-xs">
          <div className="flex items-start gap-3">
            <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-primary text-[10px] font-bold text-white">
              1
            </div>
            <p className="text-foreground/80">
              <strong>{isVi ? "Bạn bè nhận 5 Credits" : "Friend gets 5 Credits"}:</strong>{" "}
              {isVi
                ? "Đăng ký qua link của bạn để nhận ngay 5 credits dùng thử miễn phí."
                : "They sign up via your link and instantly receive 5 free trial credits."}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-primary text-[10px] font-bold text-white">
              2
            </div>
            <p className="text-foreground/80">
              <strong>{isVi ? "Bạn nhận 10 Credits" : "You get 10 Credits"}:</strong>{" "}
              {isVi
                ? "Ngay khi bạn bè hoàn tất thiết kế đầu tiên hoặc nạp gói, bạn được cộng 10 credits."
                : "As soon as your friend completes their first design or buys a pack, you receive 10 credits."}
            </p>
          </div>
        </div>

        {/* Realtime Stats */}
        <div className="mt-6 grid grid-cols-3 gap-2 border-t border-border/60 pt-4 text-center">
          <div className="rounded-xl bg-muted/40 p-2.5">
            <span className="text-[10px] uppercase font-bold text-foreground/50 block">
              {isVi ? "Lượt Click" : "Clicks"}
            </span>
            <span className="text-base font-extrabold text-foreground">
              {loading ? "..." : data?.clicks || 0}
            </span>
          </div>
          <div className="rounded-xl bg-muted/40 p-2.5">
            <span className="text-[10px] uppercase font-bold text-foreground/50 block">
              {isVi ? "Đã Mời" : "Joined"}
            </span>
            <span className="text-base font-extrabold text-brand-primary">
              {loading ? "..." : data?.totalReferrals || 0}
            </span>
          </div>
          <div className="rounded-xl bg-muted/40 p-2.5">
            <span className="text-[10px] uppercase font-bold text-foreground/50 block">
              {isVi ? "Đã Thưởng" : "Earned"}
            </span>
            <span className="text-base font-extrabold text-emerald-600">
              {loading ? "..." : `+${data?.rewardedCredits || 0}`}
            </span>
          </div>
        </div>

        {/* Manual Claim Box */}
        <div className="mt-6 border-t border-border/60 pt-4">
          <form onSubmit={handleManualClaim} className="flex flex-col gap-2">
            <label className="text-[11px] font-medium text-foreground/70">
              {isVi ? "Bạn được bạn bè giới thiệu? Nhập mã tại đây:" : "Referred by a friend? Enter their code:"}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder={isVi ? "VD: ltdanhdufnsq" : "e.g. ltdanhdufnsq"}
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-foreground/40 focus:border-brand-primary focus:outline-none"
              />
              <button
                type="submit"
                disabled={claimStatus.loading || !manualCode.trim()}
                className="shrink-0 rounded-xl bg-foreground/10 px-4 py-2 text-xs font-semibold text-foreground hover:bg-foreground/20 disabled:opacity-50 transition-colors"
              >
                {claimStatus.loading ? "..." : isVi ? "Áp dụng" : "Apply"}
              </button>
            </div>
            {claimStatus.message && (
              <p
                className={`text-[11px] font-medium ${
                  claimStatus.success ? "text-emerald-600" : "text-rose-500"
                }`}
              >
                {claimStatus.message}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
