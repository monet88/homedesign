"use client";

import { usePathname } from "next/navigation";
import { Header } from "./header";
import { Footer } from "./footer";
import { MobileNav } from "./mobile-nav";
import { SidebarProvider, AppSidebar, useSidebar } from "./app-sidebar";

function ToolShellContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div
      className={`flex min-h-dvh w-full flex-1 flex-col bg-background transition-all duration-200 ease-in-out ${
        collapsed ? "md:pl-14" : "md:pl-64"
      }`}
    >
      <main className="flex-1 pb-16 lg:pb-0">{children}</main>
      <Footer />
      <MobileNav />
    </div>
  );
}

export function ShellWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Landing page uses Floating Header + Footer + MobileNav
  const isLanding =
    pathname === "/" ||
    pathname === "/home-design-software" ||
    pathname === "/privacy-policy" ||
    pathname === "/terms-of-service";

  if (isLanding) {
    return (
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <Header />
        <main className="flex-1 pb-16 lg:pb-0">{children}</main>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  // Tool / App pages use Collapsible Sidebar + MobileNav
  return (
    <SidebarProvider>
      <AppSidebar />
      <ToolShellContent>{children}</ToolShellContent>
    </SidebarProvider>
  );
}
