"use client";

interface CatalogPreviewModalProps {
  image: string;
  title: string;
  open: boolean;
  onClose: () => void;
}

/** Large-image overlay for catalog Preview actions (ticket 17). */
export function CatalogPreviewModal({
  image,
  title,
  open,
  onClose,
}: CatalogPreviewModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
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
        className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-card bg-paper shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-pill bg-ink/80 px-3 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-80"
        >
          Close
        </button>
        <img
          src={image}
          alt={title}
          className="max-h-[85vh] w-full object-contain"
          data-testid="catalog-preview-image"
        />
      </div>
    </div>
  );
}
