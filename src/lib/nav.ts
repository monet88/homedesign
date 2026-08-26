// Navigation model shared by header + footer + root layout (DESIGN.md §1 IA /
// §4 Header): the four primary anchors on the landing page.
//
// Routes land with the landing page only (ticket 02); design tools land in
// later tickets. These links are the contract the shell renders now.

export interface NavLink {
  label: string;
  href: string;
}

export const NAV_LINKS: NavLink[] = [
  { label: "Design Tools", href: "/#tools" },
  { label: "Before & After", href: "/#before-after" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
];

// Footer columns (DESIGN.md §4 Footer): brand + 3 columns + legal.
export const FOOTER_COLUMNS: { title: string; links: NavLink[] }[] = [
  {
    title: "Design Tools",
    links: [
      { label: "AI Interior Design", href: "/ai-interior-design" },
      { label: "AI Exterior Design", href: "/ai-exterior-design" },
      { label: "AI Floor Plan", href: "/ai-floor-plan" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Home Design Software", href: "/home-design-software" },
      { label: "Projects", href: "/projects" },
      { label: "Assets", href: "/assets" },
    ],
  },
  {
    title: "About",
    links: [
      { label: "Activity", href: "/activity" },
      { label: "Pricing", href: "/#pricing" },
    ],
  },
];

export const LEGAL_LINKS: NavLink[] = [
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms of Service", href: "/terms-of-service" },
];
