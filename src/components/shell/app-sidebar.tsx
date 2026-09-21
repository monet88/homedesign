"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, createContext, useContext } from "react";
import { useSession } from "@/lib/auth/session-stub";
import { signOut } from "@/lib/auth/client";
import { useTranslation } from "@/lib/i18n/context";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";
import {
  IconHome,
  IconFolder,
  IconSofa,
  IconHousePlus,
  IconCompass,
  IconGlobe,
  IconCreditCard,
  IconUser,
  IconPanelLeftClose,
  IconMenu,
  IconClose,
  IconGift,
  IconClock,
  IconShield,
  IconVrTour,
} from "./icons";
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher";

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  setCollapsed: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <SidebarContext.Provider
      value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}
    >
      <div className="flex min-h-dvh w-full overflow-x-clip bg-background">
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebar();
  const { user, credits } = useSession();
  const { lang } = useTranslation();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const isVi = lang === "vi";

  const mainLinks = [
    { href: "/", label: isVi ? "Trang Chủ" : "Home", icon: IconHome },
    { href: "/assets", label: isVi ? "Thư Viện & Dự Án" : "Projects", icon: IconFolder },
    { href: "/activity", label: isVi ? "Nhật Ký & Audit" : "Activity & Logs", icon: IconClock },
    ...(user?.role === "admin"
      ? [{ href: "/admin", label: isVi ? "Bảng Điều Khiển Admin" : "Admin Dashboard", icon: IconShield }]
      : []),
  ];

  const designTools = [
    {
      href: "/ai-interior-design",
      label: isVi ? "AI Thiết Kế Nội Thất" : "AI Interior Design",
      icon: IconSofa,
    },
    {
      href: "/ai-exterior-design",
      label: isVi ? "AI Thiết Kế Ngoại Thất" : "AI Exterior Design",
      icon: IconHousePlus,
    },
    {
      href: "/ai-floor-plan",
      label: isVi ? "AI Mặt Bằng 2D/3D" : "AI Floor Plan",
      icon: IconCompass,
    },
    {
      href: "/tour",
      label: isVi ? "VR Tour 360° Studio" : "VR Tour 360° Studio",
      icon: IconVrTour,
    },
  ];

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Desktop & Mobile Drawer Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 ease-in-out ${
          collapsed ? "w-14" : "w-64"
        } ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between px-3 border-b border-sidebar-border/60">
          <Link
            href="/"
            className="flex items-center gap-2.5 overflow-hidden font-semibold text-sidebar-foreground"
          >
            <Image
              src="/logo.png"
              alt="HomeDesign"
              width={28}
              height={28}
              className="size-7 shrink-0 rounded-md object-contain"
            />
            {!collapsed && (
              <span className="truncate text-base font-semibold tracking-tight">
                HomeDesign
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={() => {
              if (window.innerWidth < 768) {
                setMobileOpen(false);
              } else {
                setCollapsed((c) => !c);
              }
            }}
            className="hidden md:flex size-7 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            title="Toggle Sidebar"
          >
            <IconPanelLeftClose className="size-4" />
          </button>
          
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="flex md:hidden size-7 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent"
          >
            <IconClose className="size-4" />
          </button>
        </div>

        {/* Navigation Content */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-2">
          {user && (
            <div className="px-1 pt-1">
              <WorkspaceSwitcher compact={collapsed} className="w-full" />
            </div>
          )}

          {/* Main Links */}
          <div className="flex flex-col gap-1">
            {mainLinks.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-sidebar-accent text-sidebar-foreground font-semibold shadow-xs"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>

          {/* Design Tools Group */}
          <div className="flex flex-col gap-1">
            {!collapsed && (
              <span className="px-2.5 py-1 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                {isVi ? "CÔNG CỤ THIẾT KẾ" : "Design Tools"}
              </span>
            )}
            {designTools.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-sidebar-accent text-sidebar-foreground font-semibold shadow-xs"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>

          {!collapsed && !user && (
            <div className="my-3 rounded-xl border border-border/80 bg-card p-3 shadow-2xs">
              <div className="flex items-center gap-2 mb-1.5 text-brand-copper">
                <IconGift className="size-4" />
                <span className="text-xs font-bold text-foreground">
                  {isVi ? "Đăng nhập nhận credits!" : "Log in for free credits!"}
                </span>
              </div>
              <p className="text-[11px] text-foreground/60 leading-tight mb-2.5">
                {isVi ? "Mở khóa trọn bộ công cụ AI!" : "Unlock AI design tools!"}
              </p>
              <Link
                href="/sign-in"
                className="flex h-7 w-full items-center justify-center rounded-lg bg-brand-primary text-xs font-semibold text-white transition-all hover:bg-brand-accent shadow-xs"
              >
                {isVi ? "Đăng Nhập" : "Sign In"}
              </Link>
            </div>
          )}

          {!collapsed && user && (
            <div className="my-3 rounded-xl border border-border/80 bg-card p-3 shadow-2xs">
              <div className="flex items-center justify-between mb-1.5 text-brand-copper">
                <div className="flex items-center gap-1.5">
                  <IconGift className="size-4" />
                  <span className="text-xs font-bold text-foreground">
                    {user.role === "admin"
                      ? (isVi ? "Số Dư Quản Trị" : "Admin Balance")
                      : (isVi ? "Số Dư Tín Dụng" : "Credit Balance")}
                  </span>
                </div>
                <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-xs font-bold text-brand-primary">
                  {credits ?? 0}
                </span>
              </div>
              <p className="text-[11px] text-foreground/60 leading-tight mb-2.5">
                {user.role === "admin"
                  ? (isVi ? "Đặc quyền Quản trị viên kích hoạt" : "Admin privileges active")
                  : `${credits ?? 0} ${isVi ? "tín dụng khả dụng" : "credits available"}`}
              </p>
              {user.role === "admin" ? (
                <Link
                  href="/admin"
                  className="flex h-7 w-full items-center justify-center rounded-lg bg-brand-primary text-xs font-semibold text-white transition-all hover:bg-brand-accent shadow-xs"
                >
                  {isVi ? "Bảng Điều Khiển Admin" : "Admin Dashboard"}
                </Link>
              ) : (
                <Link
                  href="/pricing"
                  className="flex h-7 w-full items-center justify-center rounded-lg bg-brand-primary text-xs font-semibold text-white transition-all hover:bg-brand-accent shadow-xs"
                >
                  {isVi ? "Nạp Thêm Credit" : "Get More Credits"}
                </Link>
              )}
            </div>
          )}

          <div className="mt-auto" />

          {/* Bottom Footer Items */}
          <div className="flex flex-col gap-1.5 border-t border-sidebar-border/60 pt-2">
            <div className={`flex items-center ${collapsed ? "flex-col gap-2 justify-center" : "justify-between px-2"}`}>
              <ThemeToggle className="size-8 rounded-lg" />
              <LanguageSwitcher compact={collapsed} />
            </div>

            <Link
              href="/#pricing"
              className="flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              title={collapsed ? (isVi ? "Bảng Giá" : "Pricing") : undefined}
            >
              <IconCreditCard className="size-4 shrink-0" />
              {!collapsed && <span>{isVi ? "Bảng Giá" : "Pricing"}</span>}
            </Link>

            {/* Account / User Menu */}
            <div className="relative">
              {user ? (
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((o) => !o)}
                  className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-sidebar-foreground/90 hover:bg-sidebar-accent"
                >
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-paper">
                    {user.initial}
                  </div>
                  {!collapsed && (
                    <div className="flex flex-1 items-center justify-between overflow-hidden">
                      <span className="truncate">{user.name || (isVi ? "Tài khoản" : "Account")}</span>
                      {credits !== null && (
                        <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-xs font-semibold text-brand-copper">
                          {credits}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              ) : (
                <Link
                  href="/sign-in"
                  className="flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                >
                  <IconUser className="size-4 shrink-0" />
                  {!collapsed && <span>{isVi ? "Đăng Nhập" : "Sign In"}</span>}
                </Link>
              )}

              {accountMenuOpen && user && (
                <div className="absolute bottom-11 left-2 z-50 w-52 rounded-card border border-border bg-card p-1.5 shadow-xl">
                  <div className="px-3 py-2 border-b border-border/50">
                    <p className="text-sm font-semibold">{user.name || (isVi ? "Tài khoản" : "Account")}</p>
                    <p className="text-xs text-foreground/60 truncate">{user.email}</p>
                    {credits !== null && (
                      <p className="mt-1 text-xs font-semibold text-brand-copper">
                        {credits} {isVi ? "Tín dụng khả dụng" : "Available Credits"}
                      </p>
                    )}
                  </div>
                  {user.role === "admin" && (
                    <Link
                      href="/admin"
                      className="block rounded-md px-3 py-2 text-sm font-semibold text-brand-primary hover:bg-sidebar-accent"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      {isVi ? "Bảng Điều Khiển Admin" : "Admin Dashboard"}
                    </Link>
                  )}
                  <Link
                    href="/assets"
                    className="block rounded-md px-3 py-2 text-sm text-foreground/85 hover:bg-sidebar-accent"
                    onClick={() => setAccountMenuOpen(false)}
                  >
                    {isVi ? "Thư Viện & Dự Án" : "Projects & Assets"}
                  </Link>
                  <Link
                    href="/activity"
                    className="block rounded-md px-3 py-2 text-sm text-foreground/85 hover:bg-sidebar-accent"
                    onClick={() => setAccountMenuOpen(false)}
                  >
                    {isVi ? "Nhật Ký & Audit" : "Activity Log"}
                  </Link>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="block w-full text-left rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    {isVi ? "Đăng Xuất" : "Sign Out"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Top Floating Trigger Bar */}
      <div className="fixed top-3 left-3 z-30 flex md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex size-9 items-center justify-center rounded-lg border border-border bg-card shadow-xs text-foreground"
          aria-label="Open sidebar menu"
        >
          <IconMenu className="size-5" />
        </button>
      </div>
    </>
  );
}
