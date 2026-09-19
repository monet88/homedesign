"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth/session-stub";
import { IconEye, IconDownload, IconClose } from "@/components/shell/icons";

type AssetItem = {
  id: string;
  name: string;
  mimeType: string;
  lifecycle: string;
  createdAt: number;
  updatedAt: number;
  refCount: number;
  isSource: boolean;
  isGenerated: boolean;
};

type AssetListResponse = {
  code: 0;
  data: { items: AssetItem[]; nextCursor: string | null };
};

type AssetDetailResponse = {
  code: 0;
  data: AssetItem & { width: number | null; height: number | null };
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function useAssetFilters() {
  const searchParams = useSearchParams();

  const type = searchParams.get("type") as "source" | "generated" | "all" | null;
  const lifecycle = searchParams.get("lifecycle");
  const projectId = searchParams.get("projectId");
  const search = searchParams.get("search") ?? "";
  const sort = searchParams.get("sort") ?? "updated-desc";
  const cursor = searchParams.get("cursor");
  return useMemo(
    () => ({ type: type ?? "all", lifecycle, projectId, search, sort, cursor }),
    [type, lifecycle, projectId, search, sort, cursor]
  );
}

function buildQuery(filters: ReturnType<typeof useAssetFilters>, overrides: Record<string, string | null>) {
  const params = new URLSearchParams();
  const merged = { ...filters, ...overrides };
  if (merged.type && merged.type !== "all") params.set("type", merged.type);
  if (merged.lifecycle) params.set("lifecycle", merged.lifecycle);
  if (merged.projectId) params.set("projectId", merged.projectId);
  if (merged.search) params.set("search", merged.search);
  if (merged.sort && merged.sort !== "updated-desc") params.set("sort", merged.sort);
  if (merged.cursor) params.set("cursor", merged.cursor);
  return params.toString();
}

function AssetsPage() {
  const { user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useAssetFilters();

  const [items, setItems] = useState<AssetItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<AssetItem | null>(null);

  const fetchPage = useCallback(
    async (cursor?: string | null) => {
      setLoading(true);
      setError(null);
      const query = buildQuery(filters, { cursor: cursor ?? null });
      try {
        const res = await fetch(`/api/assets?${query}`);
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as AssetListResponse;
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
  }, [filters.type, filters.lifecycle, filters.projectId, filters.search, filters.sort, user?.emailVerified]);

  const updateFilters = useCallback(
    (overrides: Record<string, string | null>) => {
      const query = buildQuery(filters, { ...overrides, cursor: null });
      router.push(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [filters, pathname, router]
  );

  const deleteAsset = async (asset: AssetItem) => {
    try {
      const detailRes = await fetch(`/api/assets/${asset.id}`);
      if (!detailRes.ok) throw new Error("Failed to load asset details");
      const detail = (await detailRes.json()) as AssetDetailResponse;
      const refCount = detail.data.refCount;
      const confirmed = window.confirm(
        refCount > 0
          ? `This asset is used by ${refCount} project${refCount === 1 ? "" : "s"}. Delete anyway?`
          : "Delete this asset?"
      );
      if (!confirmed) return;

      const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete asset");
      setItems((prev) => prev.filter((a) => a.id !== asset.id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!user) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold text-ink">Sign in to view your assets</h1>
        <Link href="/sign-in" className="mt-4 inline-block rounded-pill bg-ink px-6 py-2 text-paper">
          Sign In
        </Link>
      </main>
    );
  }

  if (user.emailVerified === false) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold text-ink">Verify your email</h1>
        <p className="mt-2 text-ink/70">Please verify your email to open the asset library.</p>
      </main>
    );
  }

  const hasActiveFilters = filters.type !== "all" || filters.lifecycle || filters.projectId || filters.search;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Thư Viện Ảnh & Tài Nguyên (Assets)</h1>
          <p className="mt-1 text-xs text-ink/65">Quản lý toàn bộ ảnh hiện trạng và các bản phối cảnh AI chất lượng cao.</p>
        </div>
        <Link
          href="/ai-interior-design"
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-sm hover:brightness-105 transition-all"
        >
          <IconDownload className="size-3.5 rotate-180" />
          <span>Vào Studio Thiết Kế Mới</span>
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={filters.type}
          onChange={(e) => updateFilters({ type: e.target.value })}
          className="rounded-card border border-ink/10 bg-paper px-3 py-2 text-sm"
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          <option value="source">Source</option>
          <option value="generated">Generated</option>
        </select>

        <select
          value={filters.lifecycle ?? ""}
          onChange={(e) => updateFilters({ lifecycle: e.target.value || null })}
          className="rounded-card border border-ink/10 bg-paper px-3 py-2 text-sm"
          aria-label="Filter by lifecycle"
        >
          <option value="">All lifecycles</option>
          <option value="pending-upload">Pending upload</option>
          <option value="quarantined">Quarantined</option>
          <option value="ready">Ready</option>
          <option value="rejected">Rejected</option>
          <option value="deleted">Deleted</option>
        </select>

        <input
          type="search"
          value={filters.search}
          onChange={(e) => updateFilters({ search: e.target.value })}
          placeholder="Search assets"
          className="min-w-[12rem] rounded-card border border-ink/10 bg-paper px-3 py-2 text-sm"
        />

        <select
          value={filters.sort}
          onChange={(e) => updateFilters({ sort: e.target.value })}
          className="rounded-card border border-ink/10 bg-paper px-3 py-2 text-sm"
          aria-label="Sort"
        >
          <option value="updated-desc">Last updated</option>
          <option value="created-desc">Recently created</option>
          <option value="name-asc">Name A–Z</option>
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => router.push(pathname, { scroll: false })}
            className="rounded-pill border border-ink/10 px-3 py-2 text-sm text-ink/80 hover:bg-ink/5"
          >
            Reset
          </button>
        )}
      </div>

      {error && (
        <div className="mt-6 rounded-card border border-red-200 bg-red-50 p-4 text-red-800">
          <p>Error: {error}</p>
          <button
            type="button"
            onClick={() => fetchPage(null)}
            className="mt-2 text-sm font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square rounded-card bg-ink/10" />
              <div className="mt-2 h-3 w-3/4 rounded bg-ink/10" />
            </div>
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-lg text-ink/70">
            {hasActiveFilters ? "No assets match these filters." : "You don't have any assets yet."}
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          {items.map((asset) => (
            <article
              key={asset.id}
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-ink/10 bg-card p-3 shadow-xs transition-all hover:shadow-md hover:border-amber-500/40"
            >
              <div>
                <div
                  onClick={() => setPreviewAsset(asset)}
                  className="relative aspect-square w-full cursor-pointer overflow-hidden rounded-xl bg-ink/5"
                >
                  <img
                    src={`/api/assets/${asset.id}/download?view=1`}
                    alt={asset.name}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <span className="flex size-9 items-center justify-center rounded-full bg-white text-ink shadow-md hover:scale-110 transition-transform">
                      <IconEye className="size-4.5" />
                    </span>
                  </div>
                </div>

                <div className="mt-3">
                  <h2 className="truncate text-xs font-bold text-ink" title={asset.name}>{asset.name}</h2>
                  <p className="mt-0.5 text-[11px] text-ink/50">{formatDate(asset.updatedAt)}</p>
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {asset.isSource && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200/60">Ảnh Gốc</span>
                  )}
                  {asset.isGenerated && (
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200/60">Phối Cảnh AI</span>
                  )}
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200/60">{asset.lifecycle}</span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-ink/5">
                <Link
                  href={`/ai-interior-design?sourceAssetId=${asset.id}`}
                  className="flex-1 rounded-lg bg-amber-500/10 px-2 py-1 text-center text-[11px] font-bold text-amber-700 hover:bg-amber-500/20 transition-colors"
                  title="Dùng ảnh này để thiết kế trong Studio"
                >
                  Dùng Ảnh
                </Link>
                <a
                  href={`/api/assets/${asset.id}/download`}
                  download={`${asset.name || asset.id}.png`}
                  className="flex size-7 items-center justify-center rounded-lg border border-ink/10 text-ink/70 hover:bg-ink/5 hover:text-ink transition-colors"
                  title="Tải về file ảnh gốc"
                >
                  <IconDownload className="size-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => deleteAsset(asset)}
                  className="flex size-7 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  title="Xóa tài nguyên này"
                >
                  <IconClose className="size-3.5" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => fetchPage(nextCursor)}
            disabled={loading}
            className="rounded-pill bg-ink px-6 py-2 text-paper disabled:opacity-50"
          >
            {loading ? "Đang tải…" : "Xem thêm"}
          </button>
        </div>
      )}

      {previewAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setPreviewAsset(null)}
        >
          <div
            className="relative flex max-h-[92vh] max-w-4xl w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-ink/10 px-5 py-3.5 bg-white">
              <div className="min-w-0 pr-4">
                <h3 className="truncate text-sm font-bold text-ink">{previewAsset.name}</h3>
                <p className="text-xs text-ink/50">{formatDate(previewAsset.updatedAt)} • ID: {previewAsset.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/ai-interior-design?sourceAssetId=${previewAsset.id}`}
                  className="flex items-center gap-1.5 rounded-xl bg-brand-primary px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:brightness-105 transition-all"
                >
                  <IconDownload className="size-3.5 rotate-180" />
                  <span>Dùng Vào Studio</span>
                </Link>
                <a
                  href={`/api/assets/${previewAsset.id}/download`}
                  download={`${previewAsset.name || previewAsset.id}.png`}
                  className="flex items-center gap-1.5 rounded-xl border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5 transition-colors"
                >
                  <IconDownload className="size-3.5" />
                  <span>Tải Về (PNG)</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewAsset(null)}
                  className="rounded-lg p-1.5 text-ink/60 hover:bg-ink/10 hover:text-ink transition-colors"
                >
                  <IconClose className="size-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-1 items-center justify-center overflow-auto bg-black/90 p-4">
              <img
                src={`/api/assets/${previewAsset.id}/download?view=1`}
                alt={previewAsset.name}
                className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain shadow-lg"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 bg-neutral-50 px-5 py-3 text-xs text-ink/70">
              <div className="flex items-center gap-3">
                <span>Loại: <strong>{previewAsset.isGenerated ? "Ảnh AI Render" : "Ảnh tải lên (Source)"}</strong></span>
                <span>Trạng thái: <strong className="text-emerald-600">{previewAsset.lifecycle}</strong></span>
                <span>Số dự án dùng: <strong>{previewAsset.refCount}</strong></span>
              </div>
              <span className="text-emerald-700 font-medium bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">
                ✓ Lưu trữ bảo đảm vĩnh viễn trên Cloudflare R2
              </span>
            </div>
          </div>
        </div>
      )}
    </main>

  );
}

function AssetsSkeleton() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-8 w-32 rounded bg-ink/10" />
      <div className="mt-6 h-10 w-full max-w-md rounded bg-ink/10" />
      <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-square rounded-card bg-ink/10" />
            <div className="mt-2 h-3 w-3/4 rounded bg-ink/10" />
          </div>
        ))}
      </div>
    </main>
  );
}

export default function AssetsPageWrapper() {
  return (
    <Suspense fallback={<AssetsSkeleton />}>
      <AssetsPage />
    </Suspense>
  );
}
