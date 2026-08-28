"use client";

// Minimal toast banner used by the design-flow pages (ticket #14).
// Keeps the UI self-contained — no external toast library.

export interface ToastProps {
  message: string | null;
  variant?: "info" | "error";
  onClose?: () => void;
}

export function Toast({ message, variant = "info", onClose }: ToastProps) {
  if (!message) return null;

  return (
    <div
      role="status"
      className={
        variant === "error"
          ? "rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          : "rounded-card border border-ink/10 bg-paper px-4 py-3 text-sm text-ink"
      }
    >
      <div className="flex items-center justify-between gap-4">
        <span>{message}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-ink/60 hover:text-ink"
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
