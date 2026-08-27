"use client";

import Link from "next/link";
import { useState } from "react";
import { buildCatalogPresetHref, type CatalogItem } from "@/lib/catalog";
import { CatalogPreviewModal } from "./catalog-preview-modal";

export function CatalogCard({
  item,
  onSelectPreset,
}: {
  item: CatalogItem;
  onSelectPreset?: (preset: NonNullable<CatalogItem["preset"]>) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const href = buildCatalogPresetHref(item);

  const handleUseClick = (e: React.MouseEvent) => {
    if (onSelectPreset && item.preset) {
      e.preventDefault();
      onSelectPreset(item.preset);
      const formEl = document.getElementById("generator-form");
      if (formEl) {
        formEl.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <>
      <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/5">
          <img
            src={item.image}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        </div>
        <div className="flex flex-1 flex-col justify-between p-3.5">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {item.title}
          </h3>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="flex-1 rounded-xl border border-border/80 bg-background/80 py-1.5 text-center text-xs font-semibold text-foreground/80 transition-colors hover:bg-background hover:text-foreground"
            >
              Preview
            </button>
            <Link
              href={href}
              onClick={handleUseClick}
              className="flex-1 rounded-xl bg-brand-primary py-1.5 text-center text-xs font-semibold text-brand-ivory transition-colors hover:bg-brand-accent shadow-xs"
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
        useHref={href}
        useLabel={item.useLabel}
      />
    </>
  );
}
