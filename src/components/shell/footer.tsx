import Link from "next/link";
import { FOOTER_COLUMNS, LEGAL_LINKS } from "@/lib/nav";
import { IconGlobe } from "./icons";

export function Footer() {
  return (
    <footer className="border-t border-[#1a2e26] bg-[#0b1411] text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-4 lg:px-8">
        {/* Col 1: Brand & Bio */}
        <div className="md:col-span-1">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-white"
          >
            HomeDesign
          </Link>
          <p className="mt-3 text-xs text-white/60 leading-relaxed">
            HomeDesign helps you explore interior, exterior, and floor-plan
            ideas with AI. Start from a room photo, house photo, or existing
            floor plan to compare visual directions in your browser.
          </p>
        </div>

        {/* Col 2, 3, 4: Links */}
        {FOOTER_COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white/90">
              {col.title}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs text-white/60 transition-colors hover:text-white"
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
      <div className="border-t border-[#1a2e26] px-4 py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} HomeDesign, All rights reserved</p>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5 text-white/70">
              <IconGlobe className="size-3.5" />
              <span>English</span>
            </div>

            <ul className="flex items-center gap-4">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
