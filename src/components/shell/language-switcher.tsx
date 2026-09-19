"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n/context";
import { IconGlobe, IconChevronDown } from "./icons";

interface LanguageSwitcherProps {
  compact?: boolean;
}

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { lang, setLanguage, languages } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentOption = languages.find((l) => l.code === lang) || languages[0];

  useEffect(() => {
    function handleClickOutside(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("pointerdown", handleClickOutside);
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("pointerdown", handleClickOutside);
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-xl border border-foreground/10 bg-card/60 px-3 py-1.5 text-xs font-semibold text-foreground/80 transition-all hover:border-amber-500/30 hover:bg-card/90 hover:text-foreground active:scale-[0.98] shadow-2xs backdrop-blur-xs"
      >
        <span className="text-sm leading-none">{currentOption.flag}</span>
        {!compact && <span className="tracking-tight">{currentOption.nativeName}</span>}
        <IconChevronDown className={`size-3 text-foreground/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-44 origin-top-right rounded-2xl border border-amber-500/20 bg-card/95 p-1.5 shadow-xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-500/80 border-b border-border/50 mb-1">
            Language
          </div>
          {languages.map((item) => {
            const isSelected = item.code === lang;
            return (
              <button
                key={item.code}
                role="menuitem"
                type="button"
                onClick={() => {
                  setLanguage(item.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium transition-colors ${
                  isSelected
                    ? "bg-amber-500/15 text-amber-400 font-semibold"
                    : "text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{item.flag}</span>
                  <span>{item.nativeName}</span>
                </div>
                {isSelected && (
                  <span className="size-1.5 rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
