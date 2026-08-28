"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth/session-stub";

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
        <Link href="/api/auth/sign-in" className="mt-4 inline-block rounded-pill bg-ink px-6 py-2 text-paper">
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
      <h1 className="text-2xl font-semibold text-ink">Assets</h1>

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
        <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {items.map((asset) => (
            <article
              key={asset.id}
              className="group relative rounded-card border border-ink/10 bg-paper p-2 shadow-sm"
            >
              <div className="relative aspect-square rounded-card bg-ink/5" />
              <div className="mt-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-medium text-ink">{asset.name}</h2>
                  <p className="text-xs text-ink/60">{formatDate(asset.updatedAt)}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {asset.isSource && (
                  <span className="rounded-pill bg-ink/5 px-2 py-0.5 text-xs text-ink/80">source</span>
                )}
                {asset.isGenerated && (
                  <span className="rounded-pill bg-ink/5 px-2 py-0.5 text-xs text-ink/80">generated</span>
                )}
                <span className="rounded-pill bg-ink/5 px-2 py-0.5 text-xs text-ink/80">{asset.lifecycle}</span>
                {asset.refCount > 0 && (
                  <span className="rounded-pill bg-ink/5 px-2 py-0.5 text-xs text-ink/80">
                    {asset.refCount} project{asset.refCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteAsset(asset)}
                className="mt-2 w-full rounded-pill border border-ink/10 px-3 py-1 text-xs text-ink/80 hover:bg-ink/5"
              >
                Delete
              </button>
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
            {loading ? "Loading…" : "Load more"}
          </button>
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
