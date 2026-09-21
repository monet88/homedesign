"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth/session-stub";

type ActivityItem = {
  eventId: string;
  family: "project" | "asset" | "generation" | "payment";
  type: string;
  occurredAt: number;
  referenceId: string;
  name: string;
  kind: string;
  status: string;
  detail: string | number | null;
};

type ActivityListResponse = {
  code: 0;
  data: { items: ActivityItem[]; nextCursor: string | null };
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function labelForType(type: string): string {
  return type.replace(/_/g, " ");
}

function useActivityFilters() {
  const searchParams = useSearchParams();
  const family = searchParams.get("family") as ActivityItem["family"] | null;
  const cursor = searchParams.get("cursor");
  return useMemo(() => ({ family, cursor }), [family, cursor]);
}

function buildQuery(filters: ReturnType<typeof useActivityFilters>, overrides: Record<string, string | null>) {
  const params = new URLSearchParams();
  const merged = { ...filters, ...overrides };
  if (merged.family) params.set("family", merged.family);
  if (merged.cursor) params.set("cursor", merged.cursor);
  return params.toString();
}

function getActivityMeta(event: ActivityItem) {
  switch (event.family) {
    case "generation":
      return {
        badge: "Phối Cảnh AI",
        badgeColor: "bg-amber-500/10 text-amber-700 border-amber-500/30",
        icon: "🎨",
        title:
          event.type.includes("succeeded") || event.status === "ready"
            ? `Phối cảnh AI hoàn tất — ${event.name || "Thiết kế Studio"}`
            : event.type.includes("failed")
            ? `Phối cảnh AI gặp sự cố (Đã hoàn credit)`
            : `Đang xử lý phối cảnh — ${event.name || "Thiết kế"}`,
        desc: event.detail
          ? `Thông số: ${event.detail}`
          : "Khởi tạo thành công bản vẽ không gian 3D chất lượng cao",
        actionText: "Mở Studio",
        actionHref: "/ai-interior-design",
        thumbnailUrl: null,
      };
    case "asset":
      return {
        badge: "Tài Nguyên Ảnh",
        badgeColor: "bg-sky-500/10 text-sky-700 border-sky-500/30",
        icon: "📸",
        title: `Đồng bộ ảnh ${event.kind === "source" ? "hiện trạng" : "kết quả render"}`,
        desc: event.name || "Ảnh phân giải cao đã được lưu trữ an toàn trong Studio",
        actionText: "Xem Trong Assets",
        actionHref: "/assets",
        thumbnailUrl: `/api/assets/${event.referenceId}/download?view=1`,
      };
    case "project":
      return {
        badge: "Hồ Sơ Dự Án",
        badgeColor: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
        icon: "📁",
        title: `Dự án: ${event.name || "Hồ sơ kiến trúc mới"}`,
        desc: `Cập nhật trạng thái dự án: ${event.status}`,
        actionText: "Mở Danh Sách",
        actionHref: "/projects",
        thumbnailUrl: null,
      };
    case "payment":
      return {
        badge: "Quỹ Credits",
        badgeColor: "bg-purple-500/10 text-purple-700 border-purple-500/30",
        icon: "💳",
        title: `Giao dịch Credits — ${event.name || "Số dư tài khoản"}`,
        desc: event.detail ? String(event.detail) : "Cập nhật biến động credit thành công",
        actionText: "Nạp Thêm",
        actionHref: "/pricing",
        thumbnailUrl: null,
      };
    default:
      return {
        badge: "Hệ Thống",
        badgeColor: "bg-stone-500/10 text-stone-700 border-stone-500/30",
        icon: "⚡",
        title: event.name || event.type,
        desc: `${event.family} · ${event.status}`,
        actionText: null,
        actionHref: null,
        thumbnailUrl: null,
      };
  }
}

function ActivityPage() {
  const { user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useActivityFilters();

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (cursor?: string | null) => {
      setLoading(true);
      setError(null);
      const query = buildQuery(filters, { cursor: cursor ?? null });
      try {
        const res = await fetch(`/api/activity?${query}`);
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as ActivityListResponse;
        if (cursor) {
          setItems((prev) => [...prev, ...json.data.items]);
        } else {
          setItems(json.data.items);
        }
        setNextCursor(json.data.nextCursor);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    if (!user?.emailVerified) return;
    fetchPage(null);
  }, [filters.family, user?.emailVerified]);

  const updateFilter = useCallback(
    (overrides: Record<string, string | null>) => {
      const query = buildQuery(filters, { ...overrides, cursor: null });
      router.push(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [filters, pathname, router]
  );

  if (!user) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-foreground">Đăng nhập để xem nhật ký hoạt động</h1>
        <p className="mt-2 text-sm text-muted-foreground">Theo dõi lịch sử render và sử dụng credits của bạn</p>
        <Link href="/sign-in" className="mt-6 inline-block rounded-xl bg-brand-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-accent">
          Đăng Nhập Ngay
        </Link>
      </main>
    );
  }

  if (user.emailVerified === false) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-foreground">Xác thực email tài khoản</h1>
        <p className="mt-2 text-sm text-muted-foreground">Vui lòng kiểm tra hộp thư email để kích hoạt nhật ký hoạt động Studio.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Activity
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nhật Ký & Kiểm Toán Hoạt Động — Theo dõi chi tiết các lượt phối cảnh AI, tài nguyên hình ảnh và biến động credits minh bạch.
          </p>
        </div>
        <Link
          href="/ai-interior-design"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-accent transition-all self-start sm:self-auto"
        >
          <span>+ Tạo Thiết Kế Mới</span>
        </Link>
      </div>

      {/* Filter Tabs & Accessible Combobox */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={filters.family ?? ""}
          onChange={(e) => updateFilter({ family: e.target.value || null })}
          className="rounded-xl border border-border/80 bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-2xs"
          aria-label="Filter by event family"
        >
          <option value="">All events (Tất cả)</option>
          <option value="generation">Generations (Phối Cảnh AI)</option>
          <option value="asset">Assets (Tài Nguyên Ảnh)</option>
          <option value="project">Projects (Dự Án)</option>
          <option value="payment">Payments (Giao Dịch Credit)</option>
        </select>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: null, label: "Tất cả" },
            { key: "generation", label: "🎨 Phối Cảnh" },
            { key: "asset", label: "📸 Ảnh" },
            { key: "project", label: "📁 Dự Án" },
            { key: "payment", label: "💳 Credits" },
          ].map((tab) => {
            const active = filters.family === tab.key || (!filters.family && tab.key === null);
            return (
              <button
                key={tab.key ?? "all"}
                type="button"
                onClick={() => updateFilter({ family: tab.key })}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  active
                    ? "bg-brand-primary text-white shadow-xs"
                    : "border border-border/80 bg-card text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="text-sm font-semibold">Lỗi tải dữ liệu: {error}</p>
          <button
            type="button"
            onClick={() => fetchPage(null)}
            className="mt-2 text-xs font-bold underline"
          >
            Thử lại
          </button>
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="mt-8 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-border bg-card p-4">
              <div className="h-4 w-1/3 rounded bg-muted" />
              <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="mt-12 rounded-3xl border border-dashed border-border p-12 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-2xl mb-3">
            📋
          </div>
          <p className="text-base font-bold text-foreground">
            {filters.family ? "Không có hoạt động nào phù hợp với bộ lọc." : "Chưa có hoạt động nào được ghi nhận trong 90 ngày qua."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mọi thao tác render, tải ảnh và trừ credits sẽ tự động xuất hiện ở đây.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <ol className="mt-6 space-y-3">
          {items.map((event) => {
            const meta = getActivityMeta(event);
            return (
              <li
                key={event.eventId}
                className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 transition-all hover:border-brand-primary/40 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3.5">
                  {/* Icon or Thumbnail */}
                  {meta.thumbnailUrl ? (
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-xl border border-border bg-stone-100">
                      <img
                        src={meta.thumbnailUrl}
                        alt="Thumbnail"
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-lg">
                      {meta.icon}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${meta.badgeColor}`}>
                        {meta.badge}
                      </span>
                      <h3 className="text-sm font-bold text-foreground">
                        {meta.title}
                      </h3>
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {meta.desc}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/80 font-mono">
                      <span>{event.type.replace(/_/g, " ")} — {event.name}</span>
                      <span className="mx-1.5">·</span>
                      <span>{event.family} · {event.status}{event.detail ? ` · ${event.detail}` : ""}</span>
                    </p>
                  </div>
                </div>

                {/* Right side: Time & Action button */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                  <time className="text-xs text-muted-foreground font-mono">
                    {formatDate(event.occurredAt)}
                  </time>

                  {meta.actionHref && (
                    <Link
                      href={meta.actionHref}
                      className="rounded-lg border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-foreground hover:bg-brand-primary hover:text-white transition-colors"
                    >
                      {meta.actionText} →
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {nextCursor && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => fetchPage(nextCursor)}
            disabled={loading}
            className="rounded-xl border border-border bg-card px-6 py-2 text-xs font-bold text-foreground shadow-xs hover:bg-muted disabled:opacity-50 transition-all"
          >
            {loading ? "Đang tải thêm…" : "Xem thêm lịch sử"}
          </button>
        </div>
      )}
    </main>

  );
}

function ActivitySkeleton() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-8 w-32 rounded bg-ink/10" />
      <div className="mt-6 h-10 w-full max-w-xs rounded bg-ink/10" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-card border border-ink/10 p-4">
            <div className="h-4 w-1/3 rounded bg-ink/10" />
            <div className="mt-2 h-3 w-1/4 rounded bg-ink/10" />
          </div>
        ))}
      </div>
    </main>
  );
}

export default function ActivityPageWrapper() {
  return (
    <Suspense fallback={<ActivitySkeleton />}>
      <ActivityPage />
    </Suspense>
  );
}
