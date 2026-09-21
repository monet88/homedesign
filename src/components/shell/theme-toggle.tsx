"use client";

import React, { useEffect, useState } from "react";
import { IconSun, IconMoon } from "./icons";

const STORAGE_KEY = "hd_theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as "light" | "dark" | null;
      if (saved === "dark" || saved === "light") {
        setTheme(saved);
        applyTheme(saved);
      } else {
        // Default is light
        setTheme("light");
        applyTheme("light");
      }
    } catch {
      // Storage access disabled
    }
  }, []);

  function applyTheme(newTheme: "light" | "dark") {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (newTheme === "dark") {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
    } else {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
    }
  }

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    try {
      localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // Storage write error non-fatal
    }
  }

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        className={`flex size-9 items-center justify-center rounded-xl border border-border bg-card/80 text-foreground/70 transition-colors ${className}`}
      >
        <span className="size-4 opacity-0" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      className={`flex size-9 items-center justify-center rounded-xl border border-border bg-card/90 text-foreground transition-all hover:border-brand-primary/40 hover:bg-muted active:scale-95 shadow-2xs ${className}`}
    >
      {theme === "light" ? (
        <IconMoon className="size-4 text-foreground/80 hover:text-brand-primary transition-colors" />
      ) : (
        <IconSun className="size-4 text-brand-primary transition-colors" />
      )}
    </button>
  );
}
