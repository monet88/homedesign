"use client";

import Link from "next/link";

interface CatalogPreviewModalProps {
  image: string;
  title: string;
  open: boolean;
  onClose: () => void;
  useHref?: string;
  useLabel?: string;
}

export function CatalogPreviewModal({
  image,
  title,
  open,
  onClose,
  useHref,
  useLabel = "Use style",
}: CatalogPreviewModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Preview: ${title}`}
        className="relative max-h-[92vh] max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-card">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <div className="flex items-center gap-3">
            {useHref && (
              <Link
                href={useHref}
                onClick={onClose}
                className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-brand-ivory transition-colors hover:bg-brand-accent shadow-xs"
              >
                {useLabel}
              </Link>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground/80 hover:bg-black/5"
            >
              Close
            </button>
          </div>
        </div>

        {/* Large preview image */}
        <div className="flex max-h-[75vh] items-center justify-center overflow-hidden bg-black/5 p-2">
          <img
            src={image}
            alt={title}
            className="max-h-[72vh] w-full rounded-lg object-contain"
            data-testid="catalog-preview-image"
          />
        </div>
      </div>
    </div>
  );
}
