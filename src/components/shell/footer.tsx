"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/context";
import { IconGlobe } from "./icons";

export function Footer() {
  const { t, lang, languages } = useLanguage();
  const currentLang = languages.find((l) => l.code === lang) || languages[0];

  const footerColumns = [
    {
      title: t.footer.toolsTitle,
      links: [
        { label: t.tools.interiorTitle, href: "/ai-interior-design" },
        { label: t.studio.virtualStaging, href: "/ai-interior-design" },
        { label: t.tools.exteriorTitle, href: "/ai-exterior-design" },
        { label: t.tools.floorPlanTitle, href: "/ai-floor-plan" },
      ],
    },
    {
      title: t.footer.resourcesTitle,
      links: [
        { label: t.nav.tools, href: "/#tools" },
        { label: t.nav.beforeAfter, href: "/#before-after" },
        { label: t.nav.pricing, href: "/#pricing" },
        { label: t.nav.faq, href: "/#faq" },
      ],
    },
    {
      title: t.footer.aboutTitle,
      links: [
        { label: t.common.tryFree, href: "/ai-interior-design" },
        { label: t.common.buyCredits, href: "/#pricing" },
      ],
    },
  ];

  return (
    <footer className="border-t border-border bg-card text-foreground transition-colors">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4 lg:px-8">
        {/* Col 1: Brand & Bio */}
        <div className="md:col-span-1">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2"
          >
            <span className="size-2 rounded-full bg-brand-primary" />
            <span>HomeDesign</span>
          </Link>
          <p className="mt-3 text-xs text-foreground/65 leading-relaxed">
            {t.footer.description}
          </p>
        </div>

        {/* Col 2, 3, 4: Links */}
        {footerColumns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-primary">
              {col.title}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-xs text-foreground/65 transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-border/60 px-4 py-5">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-xs text-foreground/55 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} HomeDesign. {t.footer.allRightsReserved}</p>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5 text-foreground/75 font-medium">
              <IconGlobe className="size-3.5 text-brand-primary" />
              <span>{currentLang.nativeName}</span>
            </div>

            <ul className="flex items-center gap-4">
              <li>
                <Link
                  href="/privacy-policy"
                  className="transition-colors hover:text-foreground"
                >
                  {t.footer.privacy}
                </Link>
              </li>
              <li>
                <Link
                  href="/terms-of-service"
                  className="transition-colors hover:text-foreground"
                >
                  {t.footer.terms}
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
