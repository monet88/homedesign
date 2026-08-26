// Landing page skeleton (ticket 02). Proves the shell and design tokens:
// paper bg, ink text, pill buttons, card radius, anchored nav sections.
// Full landing content (hero, tools, before/after, pricing, FAQ) lands in
// ticket #12.

import Link from "next/link";

export default function Home() {
  return (
    <main>
      {/* Hero placeholder — ticket 12 */}
      <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 lg:px-8">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-6xl">
          See your future home in minutes
        </h1>
        <p className="max-w-xl text-lg text-ink/70">
          Transform your space with AI-powered interior, exterior, and floor
          plan design.
        </p>
        <Link
          href="/#tools"
          className="rounded-pill bg-ink px-8 py-3 text-base font-medium text-paper transition-opacity hover:opacity-80"
        >
          Choose a design tool
        </Link>
      </section>

      {/* Three tools cards (DESIGN.md §5 Landing) */}
      <section
        id="tools"
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8"
      >
        <h2 className="text-center text-3xl font-semibold tracking-tight text-ink">
          All Your Home Design in One Place
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {TOOL_CARDS.map((card) => (
            <article
              key={card.title}
              className="rounded-card border border-ink/10 bg-paper p-6 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-ink">{card.title}</h3>
              <p className="mt-2 text-sm text-ink/60">{card.description}</p>
              <Link
                href={card.href}
                className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-2 transition-opacity hover:opacity-70"
              >
                {card.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* Before / After skeleton — ticket 12 */}
      <section id="before-after" className="border-t border-ink/10">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold tracking-tight text-ink">
            Before &amp; After
          </h2>
          <p className="mt-4 text-ink/60">
            Interactive comparison slider lands in ticket #12.
          </p>
        </div>
      </section>

      {/* Pricing skeleton — ticket 12 */}
      <section id="pricing" className="border-t border-ink/10">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold tracking-tight text-ink">
            Pricing
          </h2>
          <p className="mt-4 text-ink/60">
            Four-tier pricing grid lands in ticket #12.
          </p>
        </div>
      </section>

      {/* FAQ skeleton — ticket 12 */}
      <section id="faq" className="border-t border-ink/10">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold tracking-tight text-ink">
            FAQ
          </h2>
          <p className="mt-4 text-ink/60">
            Accordion section lands in ticket #12.
          </p>
        </div>
      </section>
    </main>
  );
}

const TOOL_CARDS = [
  {
    title: "AI Interior Design",
    description: "Redesign any room — living room, bedroom, kitchen, and more.",
    href: "/ai-interior-design",
    cta: "Try Interior Design →",
  },
  {
    title: "AI Exterior Design",
    description:
      "Transform your home facade, front porch, or entire exterior.",
    href: "/ai-exterior-design",
    cta: "Try Exterior Design →",
  },
  {
    title: "AI Floor Plan",
    description:
      "Upload a floor plan and visualize rooms in 2D, 3D, and 360°.",
    href: "/ai-floor-plan",
    cta: "Try Floor Plan →",
  },
];