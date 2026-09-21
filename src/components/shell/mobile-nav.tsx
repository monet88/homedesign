"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n/context";
import {
  IconHome,
  IconSofa,
  IconHousePlus,
  IconCompass,
  IconCreditCard,
} from "./icons";

export function MobileNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const items = [
    {
      href: "/",
      label: "Home",
      icon: IconHome,
      active: pathname === "/",
    },
    {
      href: "/ai-interior-design",
      label: "Interior",
      icon: IconSofa,
      active: pathname === "/ai-interior-design",
    },
    {
      href: "/ai-exterior-design",
      label: "Exterior",
      icon: IconHousePlus,
      active: pathname === "/ai-exterior-design",
    },
    {
      href: "/ai-floor-plan",
      label: "Floor Plan",
      icon: IconCompass,
      active: pathname === "/ai-floor-plan",
    },
    {
      href: "/pricing",
      label: t.nav.pricing,
      icon: IconCreditCard,
      active: pathname === "/pricing",
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 block border-t border-border/70 bg-card/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-md transition-colors lg:hidden shadow-lg"
    >
      <div className="flex items-center justify-around px-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[56px] flex-col items-center gap-1 rounded-xl py-1 text-center transition-all ${
                item.active
                  ? "text-brand-primary font-bold scale-105"
                  : "text-foreground/65 hover:text-foreground font-medium"
              }`}
            >
              <div
                className={`flex size-7 items-center justify-center rounded-lg transition-colors ${
                  item.active ? "bg-brand-primary/15" : "bg-transparent"
                }`}
              >
                <Icon className="size-4" />
              </div>
              <span className="text-[10px] tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
