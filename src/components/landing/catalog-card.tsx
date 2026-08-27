"use client";

import Link from "next/link";
import { useState } from "react";
import { buildCatalogPresetHref, type CatalogItem } from "@/lib/catalog";
import { CatalogPreviewModal } from "./catalog-preview-modal";

// Gallery card for a single catalog item (Popular Styles / Ideas).
// Preview opens a large-image modal; Use links to the design flow with presets.

export function CatalogCard({ item }: { item: CatalogItem }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const href = buildCatalogPresetHref(item);

  return (
    <>
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
              onClick={() => setPreviewOpen(true)}
              className="flex-1 rounded-pill border border-ink/20 px-2 py-1.5 text-xs text-ink/80 transition-colors hover:border-ink/50"
            >
              {item.previewLabel}
            </button>
            <Link
              href={href}
              className="flex-1 rounded-pill bg-ink px-2 py-1.5 text-center text-xs font-medium text-paper transition-opacity hover:opacity-80"
            >
              {item.useLabel}
            </Link>
          </div>
        </div>
      </article>

      <CatalogPreviewModal
        image={item.image}
        title={item.title}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}
