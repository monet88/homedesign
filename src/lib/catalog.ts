// Static catalog seed for the landing page (ticket 12) — English only, no
// backoffice (spec: "static styles/ideas seed (no backoffice)").
//
// Image strategy: ADR 0003 says public static/catalog media ships via a custom
// CDN domain; env name `NEXT_PUBLIC_CDN_URL` replaces `cdn.homedesigns.app`
// (spec "Further Notes"). Build #1 is static, so the origin CDN URLs are the
// seed values behind that env var — one place to swap, no hotlinks baked in.
//
//   NEXT_PUBLIC_CDN_URL=https://cdn.homedesigns.app
//   NEXT_PUBLIC_CDN_URL=https://cdn.example.com  (swap for production)

const CDN = process.env.NEXT_PUBLIC_CDN_URL ?? "https://cdn.homedesigns.app";

const cdn = (path: string) => `${CDN}/${path}`;

// ---------------------------------------------------------------------------
// Before / After — 5 comparisons (DESIGN.md §4 Before/After, prototype).
// Each comparison is a (label, before, after) image pair shown by the native
// slider; the 5 "Show comparison 1..5" buttons map onto these.
// ---------------------------------------------------------------------------

export interface BeforeAfterPair {
  label: string;
  before: string;
  after: string;
}

export const BEFORE_AFTER_PAIRS: BeforeAfterPair[] = [
  {
    label: "Living room redesign",
    before: cdn("ai-interior-design/before-after/empty-living-room-before.webp"),
    after: cdn("ai-interior-design/before-after/empty-living-room-after.webp"),
  },
  {
    label: "Warm modern living room",
    before: cdn("landing/hero-room-light.webp"),
    after: cdn("landing/ai-interior-design-poster.webp"),
  },
  {
    label: "Exterior refresh",
    before: cdn("landing/ai-exterior-design-poster.webp"),
    after: cdn("landing/ai-floor-plan-poster.webp"),
  },
  {
    label: "Accent wall and decor",
    before: cdn("landing/cta-room.webp"),
    after: cdn("ai-interior-design/before-after/empty-living-room-after.webp"),
  },
  {
    label: "Modern living makeover",
    before: cdn("ai-interior-design/before-after/empty-living-room-before.webp"),
    after: cdn("landing/hero-room-light.webp"),
  },
];

// ---------------------------------------------------------------------------
// Popular Styles — 12 cards (prototype list, DESIGN.md §4 Galleries).
// ---------------------------------------------------------------------------

export interface CatalogItem {
  title: string;
  image: string;
  /** Design-flow route the "Use" action links to (ticket 17 wires presets). */
  href: string;
  previewLabel: string;
  useLabel: string;
  /** Optional preset values applied when "Use" is clicked (ticket #14). */
  preset?: {
    scene?: "interior" | "exterior";
    style?: string;
    roomType?: string;
    area?: string;
    colorScheme?: string;
    aspectRatio?: string;
  };
}

const DESIGN_TOOLS = {
  interior: "/ai-interior-design",
  exterior: "/ai-exterior-design",
} as const;

const STYLE_IMAGE = cdn("landing/hero-room-light.webp");
const IDEA_IMAGE = cdn("landing/ai-interior-design-poster.webp");

const previewLabels = {
  style: "Preview style",
  idea: "Preview",
  areaIdea: "Preview area idea",
} as const;

const useLabels = {
  style: "Use style",
  idea: "Try this look",
} as const;

/** Build a design-flow URL with preset query params for catalog "Use" links. */
export function buildCatalogPresetHref(item: CatalogItem): string {
  if (!item.preset) return item.href;
  const params = new URLSearchParams();
  if (item.preset.style) params.set("style", item.preset.style);
  if (item.preset.roomType) params.set("roomType", item.preset.roomType);
  if (item.preset.area) params.set("area", item.preset.area);
  if (item.preset.colorScheme) params.set("colorScheme", item.preset.colorScheme);
  if (item.preset.aspectRatio) params.set("aspectRatio", item.preset.aspectRatio);
  const query = params.toString();
  return query ? `${item.href}?${query}` : item.href;
}

export const POPULAR_STYLES: CatalogItem[] = [
  "Modern Warm",
  "Japandi",
  "Scandinavian",
  "Minimal",
  "Classic Warm",
  "Industrial Loft",
  "Organic Modern",
  "Wabi-Sabi",
  "Mediterranean",
  "Mid-Century",
  "French Vintage",
  "Luxury Wood",
].map((title) => ({
  title,
  image: STYLE_IMAGE,
  href: DESIGN_TOOLS.interior,
  previewLabel: previewLabels.style,
  useLabel: useLabels.style,
  preset: { scene: "interior", style: title },
}));

// ---------------------------------------------------------------------------
// Ideas for Every Room — 10 cards (prototype list).
// ---------------------------------------------------------------------------

export const IDEAS: CatalogItem[] = [
  "Living Room",
  "Bedroom",
  "Kitchen",
  "Home Office",
  "Dining Room",
  "Bathroom",
  "Kids Room",
  "Nursery",
  "Entryway",
  "Balcony",
].map((title) => ({
  title,
  image: IDEA_IMAGE,
  href: DESIGN_TOOLS.interior,
  previewLabel: previewLabels.idea,
  useLabel: useLabels.idea,
  preset: { scene: "interior", roomType: title },
}));

// ---------------------------------------------------------------------------
// Exterior galleries — Popular Styles + Ideas for Every Area (ticket 17).
// Labels per DESIGN.md §4: Preview area idea / Try this look.
// ---------------------------------------------------------------------------

const EXTERIOR_STYLE_IMAGE = cdn("landing/ai-exterior-design-poster.webp");
const EXTERIOR_IDEA_IMAGE = cdn("landing/ai-floor-plan-poster.webp");

export const EXTERIOR_POPULAR_STYLES: CatalogItem[] = [
  "Modern",
  "Modern Farmhouse",
  "Contemporary",
  "Colonial",
  "Craftsman",
  "Mediterranean",
  "Minimal",
  "Industrial",
].map((title) => ({
  title,
  image: EXTERIOR_STYLE_IMAGE,
  href: DESIGN_TOOLS.exterior,
  previewLabel: previewLabels.areaIdea,
  useLabel: useLabels.idea,
  preset: { scene: "exterior", style: title },
}));

export const EXTERIOR_IDEAS: CatalogItem[] = [
  "House Facade",
  "Front Porch",
  "Backyard",
  "Front Yard",
  "Patio",
  "Driveway",
  "Garden",
].map((title) => ({
  title,
  image: EXTERIOR_IDEA_IMAGE,
  href: DESIGN_TOOLS.exterior,
  previewLabel: previewLabels.areaIdea,
  useLabel: useLabels.idea,
  preset: { scene: "exterior", area: title },
}));

// ---------------------------------------------------------------------------
// Pricing — free-first, mock labels (spec User Story 14; DESIGN.md §4).
// Mock Payment 4 packs: Lite 80 / Plus 160 / Pro 320 / Max 640 credits.
// ---------------------------------------------------------------------------

export interface PricingTier {
  name: string;
  credits: number;
  price: string;
  /** Free-first build #1: every pack is a labelled mock purchase. */
  priceNote: string;
  cta: string;
}

export const PRICING_TIERS: PricingTier[] = [
  { name: "Lite", credits: 80, price: "$8", priceNote: "Mock purchase — no charge", cta: "Buy Credits" },
  { name: "Plus", credits: 160, price: "$14", priceNote: "Mock purchase — no charge", cta: "Buy Credits" },
  { name: "Pro", credits: 320, price: "$24", priceNote: "Mock purchase — no charge", cta: "Buy Credits" },
  { name: "Max", credits: 640, price: "$40", priceNote: "Mock purchase — no charge", cta: "Buy Credits" },
];

// ---------------------------------------------------------------------------
// FAQ — accordion (DESIGN.md §4 FAQ).
// ---------------------------------------------------------------------------

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "How does AI interior design work?",
    answer:
      "Upload a photo of a room, choose a design style and palette, and our AI generates a redesigned version of the same space. You can compare the result side by side with the original.",
  },
  {
    question: "Which room types are supported?",
    answer:
      "Living rooms, bedrooms, kitchens, home offices, dining rooms, bathrooms, kids rooms, nurseries, entryways, and balconies are all supported.",
  },
  {
    question: "Do I need to pay to try it?",
    answer:
      "No. New users get free credits to start, and every credit pack is a labelled mock purchase in this build — no real charge.",
  },
  {
    question: "What image formats can I upload?",
    answer:
      "PNG, JPG, and JPEG files up to 50MB. A clear, bright photo of the room or facade gives the best results.",
  },
  {
    question: "Can I redesign the exterior of my home too?",
    answer:
      "Yes. Upload a photo of your house facade and choose an exterior style, palette, and aspect ratio to see curb-appeal transformations.",
  },
];
