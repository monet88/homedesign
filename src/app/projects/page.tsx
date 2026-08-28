"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth/session-stub";

type ProjectItem = {
  id: string;
  name: string;
  kind: "interior" | "exterior" | "floor-plan";
  status: string;
  favorite: boolean;
  visibility: string;
  createdAt: number;
  updatedAt: number;
  sourceAssetId: string | null;
};

type ProjectListResponse = {
  code: 0;
  data: { items: ProjectItem[]; nextCursor: string | null };
};

const PAGE_SIZE = 24;

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function useProjectFilters() {
  const searchParams = useSearchParams();
  const kind = searchParams.get("kind") as ProjectItem["kind"] | null;
  const favoriteRaw = searchParams.get("favorite");
  const visibility = searchParams.get("visibility");
  const search = searchParams.get("search") ?? "";
  const sort = searchParams.get("sort") ?? "updated-desc";
  const cursor = searchParams.get("cursor");
  const favorite = favoriteRaw === "true" ? true : favoriteRaw === "false" ? false : null;
  return useMemo(
    () => ({ kind, favorite, visibility, search, sort, cursor }),
    [kind, favorite, visibility, search, sort, cursor]
  );
}

function buildQuery(filters: ReturnType<typeof useProjectFilters>, overrides: Record<string, string | null>) {
  const params = new URLSearchParams();
  const merged = { ...filters, ...overrides };
  if (merged.kind) params.set("kind", merged.kind);
  if (merged.favorite !== null) params.set("favorite", String(merged.favorite));
  if (merged.visibility) params.set("visibility", merged.visibility);
  if (merged.search) params.set("search", merged.search);
  if (merged.sort && merged.sort !== "updated-desc") params.set("sort", merged.sort);
  if (merged.cursor) params.set("cursor", merged.cursor);
  return params.toString();
}

function ShareControls({ project }: { project: ProjectItem }) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiryDays, setExpiryDays] = useState("");

  const createShare = async () => {
    setBusy(true);
    setError(null);
    try {
      const expiresAt =
        expiryDays && Number(expiryDays) > 0
          ? Date.now() + Number(expiryDays) * 24 * 3600 * 1000
          : null;
      const res = await fetch(`/api/projects/${project.id}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expiresAt }),
      });
      const json = (await res.json()) as {
        code?: number;
        data?: { token: string };
        error?: string;
      };
      if (!res.ok || json.code !== 0 || !json.data?.token) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const url = `${window.location.origin}/share/${json.data.token}`;
      setShareUrl(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revokeShare = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/share`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setShareUrl(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
  };

  return (
    <div className="mt-3 space-y-2 border-t border-ink/10 pt-3">
      <p className="text-xs font-medium text-ink/70">Share (unlisted read-only)</p>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`expiry-${project.id}`}>
          Expiry days
        </label>
        <input
          id={`expiry-${project.id}`}
          type="number"
          min={1}
          placeholder="Expiry (days, optional)"
          value={expiryDays}
          onChange={(e) => setExpiryDays(e.target.value)}
          className="w-36 rounded-card border border-ink/10 px-2 py-1 text-xs"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void createShare()}
          className="rounded-pill border border-ink/15 px-3 py-1 text-xs hover:bg-ink/5 disabled:opacity-50"
        >
          Create link
        </button>
        {(project.visibility === "unlisted" || shareUrl) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void revokeShare()}
            className="rounded-pill border border-ink/15 px-3 py-1 text-xs hover:bg-ink/5 disabled:opacity-50"
          >
            Revoke
          </button>
        )}
      </div>
      {shareUrl && (
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={shareUrl}
            className="min-w-0 flex-1 rounded-card border border-ink/10 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => void copyLink()}
            className="rounded-pill bg-ink px-3 py-1 text-xs text-paper"
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectsPage() {
  const { user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useProjectFilters();

  const [items, setItems] = useState<ProjectItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (cursor?: string | null) => {
      setLoading(true);
      setError(null);
      const query = buildQuery(filters, { cursor: cursor ?? null });
      try {
        const res = await fetch(`/api/projects?${query}`);
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as ProjectListResponse;
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
  }, [filters.kind, filters.favorite, filters.visibility, filters.search, filters.sort, user?.emailVerified]);

  const updateFilters = useCallback(
    (overrides: Record<string, string | null>) => {
      const query = buildQuery(filters, { ...overrides, cursor: null });
      router.push(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [filters, pathname, router]
  );

  const toggleFavorite = async (project: ProjectItem) => {
    try {
      const res = await fetch(`/api/projects/${project.id}/favorite`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favorite: !project.favorite }),
      });
      if (!res.ok) throw new Error("Failed to update favorite");
      setItems((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, favorite: !p.favorite } : p))
      );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!user) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold text-ink">Sign in to view your projects</h1>
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
        <p className="mt-2 text-ink/70">Please verify your email to open the project library.</p>
      </main>
    );
  }

  const hasActiveFilters = filters.kind || filters.favorite !== null || filters.visibility || filters.search;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-ink">Projects</h1>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={filters.kind ?? ""}
          onChange={(e) => updateFilters({ kind: e.target.value || null })}
          className="rounded-card border border-ink/10 bg-paper px-3 py-2 text-sm"
          aria-label="Filter by kind"
        >
          <option value="">All kinds</option>
          <option value="interior">Interior</option>
          <option value="exterior">Exterior</option>
          <option value="floor-plan">Floor Plan</option>
        </select>

        <select
          value={filters.favorite === true ? "true" : filters.favorite === false ? "false" : ""}
          onChange={(e) => {
            const v = e.target.value;
            updateFilters({ favorite: v === "" ? null : v });
          }}
          className="rounded-card border border-ink/10 bg-paper px-3 py-2 text-sm"
          aria-label="Filter by favorite"
        >
          <option value="">All favorites</option>
          <option value="true">Favorites</option>
          <option value="false">Not favorites</option>
        </select>

        <select
          value={filters.visibility ?? ""}
          onChange={(e) => updateFilters({ visibility: e.target.value || null })}
          className="rounded-card border border-ink/10 bg-paper px-3 py-2 text-sm"
          aria-label="Filter by visibility"
        >
          <option value="">All visibility</option>
          <option value="private">Private</option>
          <option value="unlisted">Unlisted</option>
        </select>

        <input
          type="search"
          value={filters.search}
          onChange={(e) => updateFilters({ search: e.target.value })}
          placeholder="Search projects"
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
            onClick={() =>
              router.push(pathname, { scroll: false })
            }
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
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[4/3] rounded-card bg-ink/10" />
              <div className="mt-3 h-4 w-2/3 rounded bg-ink/10" />
              <div className="mt-2 h-3 w-1/2 rounded bg-ink/10" />
            </div>
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-lg text-ink/70">
            {hasActiveFilters ? "No projects match these filters." : "You don't have any projects yet."}
          </p>
          {!hasActiveFilters && (
            <Link
              href="/ai-interior-design"
              className="mt-4 inline-block rounded-pill bg-ink px-6 py-2 text-paper"
            >
              Start designing
            </Link>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((project) => (
            <article
              key={project.id}
              className="group relative rounded-card border border-ink/10 bg-paper p-3 shadow-sm"
            >
              <div className="aspect-[4/3] rounded-card bg-ink/5" />
              <div className="mt-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-medium text-ink">{project.name}</h2>
                  <p className="text-xs text-ink/60">{formatDate(project.updatedAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleFavorite(project)}
                  aria-label={project.favorite ? "Remove favorite" : "Add favorite"}
                  className={`shrink-0 text-lg ${project.favorite ? "text-ink" : "text-ink/30"}`}
                >
                  ★
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-pill bg-ink/5 px-2 py-0.5 text-xs text-ink/80">{project.kind}</span>
                <span className="rounded-pill bg-ink/5 px-2 py-0.5 text-xs text-ink/80">{project.visibility}</span>
                {project.favorite && (
                  <span className="rounded-pill bg-ink/5 px-2 py-0.5 text-xs text-ink/80">favorite</span>
                )}
              </div>
              <ShareControls project={project} />
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

function ProjectsSkeleton() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-8 w-32 rounded bg-ink/10" />
      <div className="mt-6 h-10 w-full max-w-md rounded bg-ink/10" />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[4/3] rounded-card bg-ink/10" />
            <div className="mt-3 h-4 w-2/3 rounded bg-ink/10" />
            <div className="mt-2 h-3 w-1/2 rounded bg-ink/10" />
          </div>
        ))}
      </div>
    </main>
  );
}

export default function ProjectsPageWrapper() {
  return (
    <Suspense fallback={<ProjectsSkeleton />}>
      <ProjectsPage />
    </Suspense>
  );
}
