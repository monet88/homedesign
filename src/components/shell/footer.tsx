import Link from "next/link";
import { FOOTER_COLUMNS, LEGAL_LINKS } from "@/lib/nav";

// Footer (DESIGN.md §4 Footer): brand + description + 3 nav columns
// (Design Tools | Resources | About) + Email + Privacy/Terms.

export function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-paper">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="md:col-span-1">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-ink"
          >
            HomeDesign
          </Link>
          <p className="mt-3 text-sm text-ink/60">
            HomeDesign helps you explore interior, exterior, and floor-plan
            ideas with AI.
          </p>
        </div>

        {FOOTER_COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h3 className="text-sm font-semibold text-ink">{col.title}</h3>
            <ul className="mt-3 space-y-2">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-ink/60 transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-3 border-t border-ink/10 px-4 py-6 text-sm text-ink/50 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>© {new Date().getFullYear()} HomeDesign</p>
        <ul className="flex gap-4">
          {LEGAL_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="transition-colors hover:text-ink">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
