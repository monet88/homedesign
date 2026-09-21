"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { signOut } from "@/lib/auth/client";
import { useSession } from "@/lib/auth/session-stub";
import { useTranslation } from "@/lib/i18n/context";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";
import { IconMenu, IconClose, IconSparkles } from "./icons";
import { ReferralModal } from "@/components/referral/referral-modal";
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher";

export function Header() {
  const { user, credits } = useSession();
  const { t, lang } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);

  const navLinks = [
    { href: "/#tools", label: t.nav.tools },
    { href: "/#before-after", label: t.nav.beforeAfter },
    { href: "/#pricing", label: t.nav.pricing },
    { href: "/#faq", label: t.nav.faq },
  ];

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3">
        <div className="w-full rounded-[24px] border border-brand-primary/25 bg-card/90 text-foreground backdrop-blur-2xl shadow-[0_1px_0_rgba(184,134,11,0.2)_inset,0_10px_30px_rgba(24,24,27,0.06)] dark:shadow-[0_1px_0_rgba(212,175,55,0.25)_inset,0_18px_44px_rgba(0,0,0,0.5)] lg:w-[84%] lg:max-w-[1360px] transition-colors">
          <div className="flex items-center justify-between px-4 py-2.5 sm:px-6">
            {/* Logo */}
            <Link href="/" className="flex items-center space-x-2.5">
              <div className="relative flex size-8 items-center justify-center rounded-lg border border-amber-600/30 bg-amber-500/10 shadow-xs">
                <Image
                  src="/logo.png"
                  alt="HomeDesign logo"
                  width={32}
                  height={32}
                  className="size-7 rounded-lg object-contain"
                />
              </div>
              <span className="text-lg font-bold tracking-tight text-foreground">
                HomeDesign
              </span>
            </Link>

            {/* Desktop Navigation Links */}
            <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-foreground/75 transition-colors hover:text-brand-primary dark:hover:text-amber-400"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Right Action Buttons */}
            <div className="hidden items-center gap-3 lg:flex">
              <ThemeToggle />
              <LanguageSwitcher />

              {user ? (
                <div className="relative flex items-center gap-2.5">
                  <WorkspaceSwitcher />
                  {credits !== null && (
                    <span
                      className="flex items-center gap-1 rounded-full border border-amber-600/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-400 shadow-2xs"
                      title="Available Credits"
                    >
                      <IconSparkles className="size-3" />
                      <span>{credits} {t.common.credits}</span>
                    </span>
                  )}
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={userDropdownOpen}
                    aria-label="Open account menu"
                    onClick={() => setUserDropdownOpen((o) => !o)}
                    className="flex size-8 items-center justify-center rounded-full border border-amber-500/30 bg-gradient-to-r from-amber-600 to-amber-500 text-xs font-bold text-slate-950 shadow-xs transition-transform hover:scale-105"
                  >
                    {user.initial}
                  </button>
                  {userDropdownOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-10 z-50 w-52 rounded-2xl border border-amber-500/20 bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl"
                    >
                      <div className="px-3 py-2 border-b border-border/50">
                        <p className="text-sm font-semibold">{user.name || "Account"}</p>
                        <p className="text-xs text-foreground/60 truncate">{user.email}</p>
                      </div>
                      {user.role === "admin" && (
                        <Link
                          role="menuitem"
                          href="/admin"
                          className="block rounded-xl px-3 py-2 text-sm font-semibold text-amber-400 hover:bg-amber-500/10"
                          onClick={() => setUserDropdownOpen(false)}
                        >
                          {t.common.adminDashboard}
                        </Link>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          setReferralOpen(true);
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold text-brand-primary hover:bg-brand-primary/10 transition-colors"
                      >
                        <span>{lang === "vi" ? "Mời bạn bè (+10c)" : "Invite Friends (+10c)"}</span>
                        <span className="rounded-full bg-brand-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-brand-primary">Free</span>
                      </button>
                      <Link
                        role="menuitem"
                        href="/assets"
                        className="block rounded-xl px-3 py-2 text-sm text-foreground/85 hover:bg-white/5"
                        onClick={() => setUserDropdownOpen(false)}
                      >
                        {t.common.projectsAssets}
                      </Link>
                      <Link
                        role="menuitem"
                        href="/activity"
                        className="block rounded-xl px-3 py-2 text-sm text-foreground/85 hover:bg-white/5"
                        onClick={() => setUserDropdownOpen(false)}
                      >
                        Activity Log
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void signOut()}
                        className="block w-full rounded-xl px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
                      >
                        {t.common.signOut}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    href="/sign-in"
                    className="rounded-xl border border-foreground/15 bg-card/40 px-4 py-1.5 text-xs font-semibold text-foreground transition-all hover:bg-card hover:border-amber-500/30"
                  >
                    {t.common.signIn}
                  </Link>
                  <Link
                    href="/ai-interior-design"
                    className="rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-1.5 text-xs font-bold text-slate-950 shadow-md transition-all hover:brightness-110 active:scale-[0.98]"
                  >
                    {t.common.tryFree}
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile Hamburger Button & Language Switcher & Theme */}
            <div className="flex items-center gap-1.5 lg:hidden">
              <ThemeToggle className="size-8 rounded-lg" />
              <LanguageSwitcher compact />
              {user && credits !== null && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-400">
                  {credits}
                </span>
              )}
              <button
                type="button"
                aria-label="Toggle menu"
                onClick={() => setMobileMenuOpen((o) => !o)}
                className="flex size-8 items-center justify-center rounded-lg text-foreground hover:bg-white/5"
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
            <div className="border-t border-border/40 px-4 py-4 lg:hidden">
              <nav className="flex flex-col gap-3">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-sm font-medium text-foreground/80 hover:text-amber-400"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                <hr className="my-1 border-border/40" />
                {user ? (
                  <>
                    {user.role === "admin" && (
                      <Link
                        href="/admin"
                        className="text-sm font-semibold text-amber-400"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {t.common.adminDashboard}
                      </Link>
                    )}
                    <Link
                      href="/assets"
                      className="text-sm font-medium text-foreground/80 hover:text-foreground"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {t.common.projectsAssets}
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setReferralOpen(true);
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold text-brand-primary hover:bg-brand-primary/10"
                    >
                      <span>{lang === "vi" ? "Mời bạn bè (+10c)" : "Invite Friends (+10c)"}</span>
                      <span className="rounded-full bg-brand-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-brand-primary">Free</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        void signOut();
                      }}
                      className="block w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-red-400 hover:bg-red-500/10"
                    >
                      {t.common.signOut}
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2 pt-1">
                    <Link
                      href="/sign-in"
                      className="rounded-xl border border-border py-2 text-center text-xs font-semibold text-foreground"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {t.common.signIn}
                    </Link>
                    <Link
                      href="/ai-interior-design"
                      className="rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 py-2 text-center text-xs font-bold text-slate-950"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {t.common.tryFree}
                    </Link>
                  </div>
                )}
              </nav>
            </div>
          )}
        </div>
      </header>

      <ReferralModal open={referralOpen} onClose={() => setReferralOpen(false)} />
    </>
  );
}
