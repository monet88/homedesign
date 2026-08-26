import Link from "next/link";
import { CatalogItem } from "@/lib/catalog";

// Gallery card for a single catalog item (Popular Styles / Ideas).
// Shows an image, title, and two action buttons (Preview / Use).
// The "Use" action links to the design-flow route (ticket 17 wires presets).
// The "Preview" button is a placeholder — ticket 17 adds the modal overlay.

export function CatalogCard({ item }: { item: CatalogItem }) {
  return (
    <article className="card overflow-hidden rounded-card bg-paper shadow-sm">
      <img
        src={item.image}
        alt={item.title}
        className="aspect-[4/3] w-full object-cover"
        loading="lazy"
      />
      <div className="body p-3">
        <h3 className="truncate text-sm font-semibold text-ink">
          {item.title}
        </h3>
        <div className="actions mt-2 flex gap-1.5">
          <button
            type="button"
            className="flex-1 rounded-pill border border-ink/20 px-2 py-1.5 text-xs text-ink/80 transition-colors hover:border-ink/50"
          >
            {item.previewLabel}
          </button>
          <Link
            href={item.href}
            className="flex-1 rounded-pill bg-ink px-2 py-1.5 text-center text-xs font-medium text-paper transition-opacity hover:opacity-80"
          >
            {item.useLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}