import type { ShareView } from "@/lib/library/share";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ShareViewPanel({
  token,
  view,
}: {
  token: string;
  view: ShareView | null;
}) {
  if (!view) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-ink">Share unavailable</h1>
        <p className="mt-2 text-ink/70">This link may have expired or been revoked.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6">
        <p className="text-sm uppercase tracking-wide text-ink/60">Shared project</p>
        <h1 className="mt-1 text-3xl font-semibold text-ink">{view.name}</h1>
        <p className="mt-1 text-sm text-ink/70">
          {view.kind.replace("-", " ")} · Updated {formatDate(view.updatedAt)}
        </p>
      </header>

      <aside
        className="mb-8 rounded-card border border-ink/10 bg-ink/5 px-4 py-3 text-sm text-ink/80"
        role="note"
        aria-label="Sharing privacy notice"
      >
        Read-only share — not DRM. Anyone viewing these images can save, screenshot, or copy them using
        normal browser tools. This view intentionally omits a download button, but that is not copy
        protection.
      </aside>

      {view.assets.length === 0 ? (
        <p className="text-ink/70">No images are selected for this share yet.</p>
      ) : (
        <ul className="grid gap-4">
          {view.assets.map((asset) => (
            <li key={asset.id} className="overflow-hidden rounded-card border border-ink/10 bg-white/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/share/${encodeURIComponent(token)}/assets/${encodeURIComponent(asset.id)}`}
                alt={`Shared design ${asset.id}`}
                className="aspect-[4/3] w-full object-cover"
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
