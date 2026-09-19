"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PRICING_TIERS, type PricingTier } from "@/lib/catalog";
import { useSession } from "@/lib/auth/session-stub";
import { useTranslation } from "@/lib/i18n/context";
import { IconSparkles, IconCheck } from "@/components/shell/icons";

const PACK_BY_NAME: Record<string, "lite" | "plus" | "pro" | "max"> = {
  Lite: "lite",
  Plus: "plus",
  Pro: "pro",
  Max: "max",
};

const VND_PRICES: Record<string, number> = {
  lite: 200_000,
  plus: 400_000,
  pro: 700_000,
  max: 1_200_000,
};

interface SepayOrderData {
  orderId: string;
  transferCode: string;
  amount: number;
  currency: string;
  credits: number;
  bankId: string;
  accountNo: string;
  accountName: string;
  qrUrl: string;
}

interface MockPaymentModalProps {
  open: boolean;
  onClose: () => void;
  onPurchased?: () => void;
  message?: string | null;
}

export function MockPaymentModal({
  open,
  onClose,
  onPurchased,
  message,
}: MockPaymentModalProps) {
  const { user } = useSession();
  const { t, lang } = useTranslation();
  const [paymentMethod, setPaymentMethod] = useState<"vietqr" | "stripe">("vietqr");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<SepayOrderData | null>(null);
  const [completed, setCompleted] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  // Auto select payment method and reset state when opening/closing
  useEffect(() => {
    if (!open) {
      setOrder(null);
      setCompleted(false);
      setError(null);
      setBusy(null);
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    } else {
      // Auto-switch: Vietnam language -> VietQR, International languages -> Stripe
      setPaymentMethod(lang === "vi" ? "vietqr" : "stripe");
    }
  }, [open, lang]);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Poll order status when an order is active
  useEffect(() => {
    if (!order || completed) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/payments/sepay/order?orderId=${order.orderId}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { code: number; data?: { status: string; completed?: boolean } };
        if (json.code === 0 && (json.data?.status === "completed" || json.data?.completed)) {
          setCompleted(true);
          if (pollIntervalRef.current) {
            window.clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          onPurchased?.();
        }
      } catch {
        // Polling failure is non-fatal
      }
    };

    pollIntervalRef.current = window.setInterval(poll, 2500);
    return () => {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
      }
    };
  }, [order, completed, onPurchased]);

  // Copy to clipboard helper
  const copyToClipboard = (text: string, fieldName: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  // Download QR code image to client device
  const downloadQrCode = async () => {
    if (!order?.qrUrl) return;
    try {
      const response = await fetch(order.qrUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `vietqr-homedesign-${order.orderId.slice(0, 8)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(order.qrUrl, "_blank");
    }
  };

  // Create real VietQR order
  const checkoutVietQR = useCallback(
    async (tier: PricingTier) => {
      const pack = PACK_BY_NAME[tier.name];
      if (!pack) return;
      setBusy(`vietqr-${tier.name}`);
      setError(null);
      try {
        const res = await fetch("/api/payments/sepay/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ pack }),
        });
        const json = (await res.json()) as { error?: string; code?: number; data?: SepayOrderData };
        if (!res.ok || json.code !== 0 || !json.data) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        setOrder(json.data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(null);
      }
    },
    []
  );

  // Create Stripe Checkout Session
  const checkoutStripe = useCallback(
    async (tier: PricingTier) => {
      const pack = PACK_BY_NAME[tier.name];
      if (!pack) return;
      setBusy(`stripe-${tier.name}`);
      setError(null);
      try {
        const res = await fetch("/api/payments/stripe/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ pack }),
        });
        const json = (await res.json()) as { error?: string; code?: number; data?: { checkoutUrl: string } };
        if (!res.ok || json.code !== 0 || !json.data?.checkoutUrl) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        window.location.href = json.data.checkoutUrl;
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("STRIPE_NOT_CONFIGURED")) {
          setError(
            "Cổng thanh toán quốc tế Stripe chưa kích hoạt STRIPE_SECRET_KEY trong môi trường này. Vui lòng chuyển sang tab VietQR để nạp tức thì qua ngân hàng."
          );
        } else {
          setError(msg);
        }
      } finally {
        setBusy(null);
      }
    },
    []
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
    >
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl border border-amber-500/25 bg-card/95 p-4 sm:p-6 shadow-2xl text-foreground my-4 sm:my-8 backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-4">
          <div>
            <h2 id="payment-modal-title" className="text-lg font-bold flex items-center gap-2">
              <IconSparkles className="size-4 text-amber-400" />
              <span>{t.paymentModal.title}</span>
            </h2>
            <p className="mt-1 text-xs text-foreground/65">
              {t.paymentModal.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-foreground/40 hover:bg-white/5 hover:text-foreground transition"
          >
            ✕
          </button>
        </div>

        {message && (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
            {message}
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            <p className="font-semibold">Có lỗi xảy ra:</p>
            <p className="mt-0.5">{error}</p>
          </div>
        )}

        {/* Not Logged In Notice */}
        {!user && (
          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-card p-5 text-center">
            <p className="text-sm font-semibold">{t.common.signIn}</p>
            <p className="mt-1 text-xs text-foreground/65">
              Credits sau khi thanh toán sẽ được bảo lưu vĩnh viễn trong tài khoản của bạn.
            </p>
            <Link
              href="/sign-in"
              onClick={onClose}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-6 text-xs font-bold text-slate-950 transition hover:brightness-110 shadow-sm"
            >
              {t.common.signIn}
            </Link>
          </div>
        )}

        {/* State: Completed */}
        {user && completed && (
          <div className="mt-6 py-6 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 mb-4">
              <IconCheck className="size-8" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Thanh toán thành công!</h3>
            <p className="mt-2 text-sm text-foreground/75">
              Đã nạp thành công <span className="font-bold text-amber-400">+{order?.credits} credits</span> vào tài khoản của bạn.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-8 text-xs font-bold text-slate-950 transition hover:brightness-110 shadow-sm"
            >
              Bắt đầu thiết kế ngay
            </button>
          </div>
        )}

        {/* State: Order QR Active (Waiting for Payment) */}
        {user && order && !completed && (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
              <p className="text-xs font-semibold text-amber-400">
                Đang chờ nhận chuyển khoản qua VietQR...
              </p>
              <div className="mt-3 flex justify-center">
                <div className="relative size-52 sm:size-56 overflow-hidden rounded-2xl border-2 border-amber-500/30 bg-white p-2 shadow-sm">
                  <Image
                    src={order.qrUrl}
                    alt="VietQR Payment Code"
                    fill
                    unoptimized
                    className="object-contain"
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={downloadQrCode}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500 hover:text-slate-950 transition shadow-2xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" x2="12" y1="15" y2="3" />
                  </svg>
                  <span>Lưu mã QR về máy</span>
                </button>
                <p className="text-[11px] text-foreground/60 max-w-xs">
                  {t.paymentModal.scanInstruction}
                </p>
              </div>
            </div>

            {/* Transfer Details with Copy Buttons */}
            <div className="rounded-2xl border border-border bg-card p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-border/60">
                <span className="text-foreground/60">Ngân hàng</span>
                <span className="font-bold">{order.bankId}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/60">
                <span className="text-foreground/60">Số tài khoản</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-amber-400">{order.accountNo}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(order.accountNo, "accountNo")}
                    className="text-[11px] text-amber-400 hover:underline font-semibold"
                  >
                    {copiedField === "accountNo" ? t.paymentModal.copied : t.paymentModal.copyAccount}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/60">
                <span className="text-foreground/60">Chủ tài khoản</span>
                <span className="font-bold">{order.accountName}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/60">
                <span className="text-foreground/60">Số tiền</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-amber-400">
                    {order.amount.toLocaleString("vi-VN")} đ
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(String(order.amount), "amount")}
                    className="text-[11px] text-amber-400 hover:underline font-semibold"
                  >
                    {copiedField === "amount" ? t.paymentModal.copied : t.paymentModal.copyAmount}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center py-1 bg-amber-500/10 px-2 rounded-xl border border-amber-500/20">
                <span className="text-amber-300 font-semibold">Nội dung CK</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-amber-200">
                    {order.transferCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(order.transferCode, "memo")}
                    className="text-[11px] font-bold text-amber-400 hover:underline"
                  >
                    {copiedField === "memo" ? t.paymentModal.copied : t.paymentModal.copyTransferCode}
                  </button>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-center text-foreground/50">
              ⚡ Hệ thống tự động ghi nhận và cộng credit ngay khi tiền vào tài khoản.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOrder(null)}
                className="flex-1 h-9 rounded-xl border border-border text-xs font-semibold hover:bg-white/5 transition"
              >
                ← Chọn gói khác
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-9 rounded-xl bg-card border border-border text-xs font-semibold hover:bg-white/10 transition"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        )}

        {/* State: Package Selection */}
        {user && !order && !completed && (
          <div className="mt-5 space-y-4">
            {/* Method Tabs */}
            <div className="flex rounded-2xl border border-amber-500/20 bg-background/50 p-1">
              <button
                type="button"
                onClick={() => setPaymentMethod("vietqr")}
                className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  paymentMethod === "vietqr"
                    ? "bg-gradient-to-r from-amber-600 to-amber-500 text-slate-950 shadow-sm"
                    : "text-foreground/70 hover:text-foreground"
                }`}
              >
                <span>🇻🇳</span>
                <span>{t.paymentModal.vietqrTab}</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("stripe")}
                className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  paymentMethod === "stripe"
                    ? "bg-gradient-to-r from-amber-600 to-amber-500 text-slate-950 shadow-sm"
                    : "text-foreground/70 hover:text-foreground"
                }`}
              >
                <span>💳</span>
                <span>{t.paymentModal.stripeTab}</span>
              </button>
            </div>

            <div className="rounded-xl border border-amber-500/15 bg-card/60 p-2.5 text-[11px] text-foreground/70 flex items-center justify-between">
              <span>
                {paymentMethod === "stripe"
                  ? t.paymentModal.stripeDesc
                  : t.paymentModal.vietqrDesc}
              </span>
              <span className="font-semibold text-amber-400 shrink-0 ml-2">SSL 256-bit</span>
            </div>

            <div className="space-y-3">
              {PRICING_TIERS.map((tier) => {
                const packKey = PACK_BY_NAME[tier.name];
                const vnd = packKey ? VND_PRICES[packKey] : null;
                const isVietQR = paymentMethod === "vietqr";
                const isBusy =
                  busy === `vietqr-${tier.name}` || busy === `stripe-${tier.name}`;

                return (
                  <div
                    key={tier.name}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-500/15 bg-card p-3.5 hover:border-amber-500/40 transition hover:shadow-lg"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{tier.name}</span>
                        <span className="text-xs text-amber-400 font-semibold">
                          +{tier.credits} {t.common.credits}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/60 mt-0.5">
                        {tier.description}
                      </p>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                      <div className="text-left sm:text-right">
                        <div className="font-bold text-sm text-foreground">
                          {isVietQR
                            ? vnd
                              ? `${vnd.toLocaleString("vi-VN")} đ`
                              : tier.price
                            : `${tier.price} USD`}
                        </div>
                        <div className="text-[11px] text-foreground/45">
                          {isVietQR ? `${tier.price} USD` : vnd ? `≈ ${vnd.toLocaleString("vi-VN")} đ` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          isVietQR ? checkoutVietQR(tier) : checkoutStripe(tier)
                        }
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-4 text-xs font-bold text-slate-950 transition hover:brightness-110 disabled:opacity-50"
                      >
                        {isBusy
                          ? t.common.loading
                          : isVietQR
                          ? "Quét VietQR"
                          : t.paymentModal.proceedStripe}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Backward-compatible export alias
export { MockPaymentModal as PaymentModal };
