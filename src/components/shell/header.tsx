"use client";

import Link from "next/link";
import { useState } from "react";
import { NAV_LINKS } from "@/lib/nav";
import { useSession } from "@/lib/auth/session-stub";

// Header (DESIGN.md §4 Header / Nav): sticky, ~64px, backdrop-blur.
// Anonymous → "Sign In" pill button. Logged-in → avatar initial + dropdown
// (Assets / Activity / Sign Out). Ticket #03 swaps the session stub for real
// BetterAuth; the component only consumes the `Session` shape.

export function Header() {
  const { user, credits } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/85 backdrop-blur">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-8"
      >
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-ink"
        >
          HomeDesign
        </Link>

        <ul className="ml-4 hidden items-center gap-6 text-sm text-ink/80 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="transition-colors hover:text-ink">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-3">
          {user && credits !== null && (
            <span
              className="rounded-pill border border-ink/15 bg-ink/5 px-3 py-1 text-xs font-medium text-ink/90"
              title="Available Credits (active holds deducted)"
            >
              {credits} Credits
            </span>
          )}
          {user ? (
            <div className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Open account menu"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-medium text-paper transition-opacity hover:opacity-80"
              >
                {user.initial}
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  aria-label="Account"
                  className="absolute right-0 mt-2 w-44 rounded-card border border-ink/10 bg-paper p-1.5 shadow-lg"
                >
                  <Link
                    role="menuitem"
                    href="/assets"
                    className="block rounded-md px-3 py-2 text-sm text-ink/90 hover:bg-ink/5"
                  >
                    Assets
                  </Link>
                  <Link
                    role="menuitem"
                    href="/activity"
                    className="block rounded-md px-3 py-2 text-sm text-ink/90 hover:bg-ink/5"
                  >
                    Activity
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-ink/90 hover:bg-ink/5"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/api/auth/sign-in"
              className="rounded-pill bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80"
            >
              Sign In
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
