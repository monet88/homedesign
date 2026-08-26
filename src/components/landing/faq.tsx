"use client";

import { useState } from "react";
import { FaqItem } from "@/lib/catalog";

// FAQ accordion (DESIGN.md §4 FAQ). Simple open/close toggle per item, native
// HTML <details>/<summary> would work but a client component with animated
// open/close is more consistent with the design screenshots.

export function Faq({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div
            key={i}
            className="rounded-card border border-ink/10 bg-paper shadow-sm"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium text-ink transition-colors hover:bg-ink/[0.02]"
            >
              <span>{item.question}</span>
              <span
                className={`ml-4 shrink-0 text-ink/40 transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              >
                ▼
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-ink/10 px-5 pb-4 pt-3 text-sm text-ink/70">
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}