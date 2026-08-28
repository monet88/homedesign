"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { signOut } from "@/lib/auth/client";
import { useSession } from "@/lib/auth/session-stub";
import { IconGlobe, IconMenu, IconClose } from "./icons";

export function Header() {
  const { user, credits } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const navLinks = [
    { href: "/#tools", label: "Design Tools" },
    { href: "/#before-after", label: "Before & After" },
    { href: "/#pricing", label: "Pricing" },
    { href: "/#faq", label: "FAQ" },
  ];

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3">
      <div className="w-full rounded-[24px] border border-foreground/10 bg-card/85 text-foreground backdrop-blur-xl shadow-[0_1px_0_rgba(255,255,255,0.45)_inset,0_18px_44px_rgba(23,20,17,0.08)] lg:w-[82%] lg:max-w-[1320px]">
        <div className="flex items-center justify-between px-4 py-2.5 sm:px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2.5">
            <Image
              src="/logo.png"
              alt="HomeDesign logo"
              width={32}
              height={32}
              className="size-8 rounded-lg object-contain"
            />
            <span className="text-lg font-semibold tracking-tight text-foreground">
              HomeDesign
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right Action Buttons */}
          <div className="hidden items-center gap-3 lg:flex">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-foreground/70 hover:bg-black/5 hover:text-foreground"
            >
              <IconGlobe className="size-4" />
              <span>English</span>
            </button>

            {user ? (
              <div className="relative flex items-center gap-2.5">
                {credits !== null && (
                  <span
                    className="rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-semibold text-brand-copper"
                    title="Available Credits"
                  >
                    {credits} Credits
                  </span>
                )}
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={userDropdownOpen}
                  aria-label="Open account menu"
                  onClick={() => setUserDropdownOpen((o) => !o)}
                  className="flex size-8 items-center justify-center rounded-full bg-brand-primary text-xs font-semibold text-brand-ivory transition-opacity hover:opacity-85"
                >
                  {user.initial}
                </button>
                {userDropdownOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-10 z-50 w-48 rounded-card border border-border bg-card p-1.5 shadow-xl"
                  >
                    <div className="px-3 py-2 border-b border-border/50">
                      <p className="text-sm font-semibold">{user.name || "Account"}</p>
                      <p className="text-xs text-foreground/60 truncate">{user.email}</p>
                    </div>
                    {user.role === "admin" && (
                      <Link
                        role="menuitem"
                        href="/admin"
                        className="block rounded-md px-3 py-2 text-sm font-semibold text-brand-forest hover:bg-brand-forest/10"
                        onClick={() => setUserDropdownOpen(false)}
                      >
                        Admin Dashboard
                      </Link>
                    )}
                    <Link
                      role="menuitem"
                      href="/assets"
                      className="block rounded-md px-3 py-2 text-sm text-foreground/85 hover:bg-black/5"
                      onClick={() => setUserDropdownOpen(false)}
                    >
                      Projects &amp; Assets
                    </Link>
                    <Link
                      role="menuitem"
                      href="/activity"
                      className="block rounded-md px-3 py-2 text-sm text-foreground/85 hover:bg-black/5"
                      onClick={() => setUserDropdownOpen(false)}
                    >
                      Activity Log
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void signOut()}
                      className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/api/auth/sign-in"
                  className="rounded-full border border-foreground/15 bg-background/60 px-4 py-1.5 text-sm font-medium text-foreground transition-all hover:bg-background hover:shadow-xs"
                >
                  Sign In
                </Link>
                <Link
                  href="/ai-interior-design"
                  className="rounded-full bg-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-ivory transition-all hover:bg-brand-accent shadow-xs"
                >
                  Try Free
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Hamburger Button */}
          <div className="flex items-center gap-2 lg:hidden">
            {user && credits !== null && (
              <span className="rounded-full bg-brand-primary/10 px-2.5 py-0.5 text-xs font-semibold text-brand-copper">
                {credits}
              </span>
            )}
            <button
              type="button"
              aria-label="Toggle menu"
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="flex size-8 items-center justify-center rounded-lg text-foreground hover:bg-black/5"
            >
              {mobileMenuOpen ? (
                <IconClose className="size-5" />
              ) : (
                <IconMenu className="size-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-foreground/10 px-4 py-4 lg:hidden">
            <nav className="flex flex-col gap-3">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-foreground/80 hover:text-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <hr className="my-1 border-foreground/10" />
              {user ? (
                <>
                  {user.role === "admin" && (
                    <Link
                      href="/admin"
                      className="text-sm font-semibold text-brand-forest hover:text-foreground"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Admin Dashboard
                    </Link>
                  )}
                  <Link
                    href="/assets"
                    className="text-sm font-medium text-foreground/80 hover:text-foreground"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Projects &amp; Assets
                  </Link>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="text-left text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-2 pt-1">
                  <Link
                    href="/api/auth/sign-in"
                    className="rounded-lg border border-border py-2 text-center text-sm font-semibold text-foreground"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/ai-interior-design"
                    className="rounded-lg bg-brand-primary py-2 text-center text-sm font-semibold text-brand-ivory"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Try Free
                  </Link>
                </div>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
