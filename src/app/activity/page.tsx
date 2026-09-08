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
      <main className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold text-ink">Sign in to view activity</h1>
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
        <p className="mt-2 text-ink/70">Please verify your email to open the activity timeline.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-ink">Activity</h1>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={filters.family ?? ""}
          onChange={(e) => updateFilter({ family: e.target.value || null })}
          className="rounded-card border border-ink/10 bg-paper px-3 py-2 text-sm"
          aria-label="Filter by event family"
        >
          <option value="">All events</option>
          <option value="project">Projects</option>
          <option value="asset">Assets</option>
          <option value="generation">Generations</option>
          <option value="payment">Payments</option>
        </select>

        {filters.family && (
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
        <div className="mt-8 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-card border border-ink/10 p-4">
              <div className="h-4 w-1/3 rounded bg-ink/10" />
              <div className="mt-2 h-3 w-1/4 rounded bg-ink/10" />
            </div>
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-lg text-ink/70">
            {filters.family ? "No activity matches this filter." : "No activity in the last 90 days."}
          </p>
        </div>
      )}

      {items.length > 0 && (
        <ol className="mt-8 space-y-3">
          {items.map((event) => (
            <li
              key={event.eventId}
              className="flex flex-col gap-1 rounded-card border border-ink/10 bg-paper p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-ink">
                  {labelForType(event.type)} — {event.name}
                </p>
                <p className="text-sm text-ink/60">
                  {event.family} · {event.status}
                  {event.detail !== null && event.detail !== undefined ? ` · ${event.detail}` : ""}
                </p>
              </div>
              <time className="text-sm text-ink/60">{formatDate(event.occurredAt)}</time>
            </li>
          ))}
        </ol>
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
