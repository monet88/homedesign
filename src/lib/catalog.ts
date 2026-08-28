// Static catalog data matching homedesigns.app 1:1

const CDN = process.env.NEXT_PUBLIC_CDN_URL ?? "https://cdn.homedesigns.app";
const cdn = (path: string) => `${CDN}/${path}`;

export interface BeforeAfterPair {
  label: string;
  before: string;
  after: string;
  prompt?: string;
}

export interface CatalogItem {
  id?: string;
  title: string;
  image: string;
  beforeImage?: string;
  afterImage?: string;
  href: string;
  previewLabel: string;
  useLabel: string;
  description?: string;
  preset?: {
    scene?: "interior" | "exterior" | "floor-plan";
    style?: string;
    roomType?: string;
    area?: string;
    colorScheme?: string;
    aspectRatio?: string;
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface PricingTier {
  name: string;
  price: string;
  originalPrice?: string;
  priceNote: string;
  credits: number;
  description: string;
  cta: string;
  badge?: string;
  features: string[];
}

// ---------------------------------------------------------------------------
// Before / After comparisons for Landing 3-Tabs and Tool Pages
// ---------------------------------------------------------------------------

export const BEFORE_AFTER_PAIRS: BeforeAfterPair[] = [
  {
    label: "Living room redesign",
    before: cdn("ai-interior-design/before-after/empty-living-room-before.webp"),
    after: cdn("ai-interior-design/before-after/empty-living-room-after.webp"),
    prompt: "Turn this empty living room into a warm modern space — beige sofa, oak coffee table, soft daylight, neutral palette; keep the room layout unchanged.",
  },
  {
    label: "Warm modern living room",
    before: cdn("landing/hero-room-light.webp"),
    after: cdn("landing/ai-interior-design-poster.webp"),
    prompt: "Redesign into a calm Scandinavian bedroom with light wood accents, linen bedding, and minimalist lighting.",
  },
  {
    label: "Exterior refresh",
    before: cdn("landing/ai-exterior-design-poster.webp"),
    after: cdn("landing/ai-floor-plan-poster.webp"),
    prompt: "Transform into a luxury modern kitchen with marble island, dark wood cabinetry, and recessed lighting.",
  },
  {
    label: "Accent wall and decor",
    before: cdn("landing/cta-room.webp"),
    after: cdn("ai-interior-design/before-after/empty-living-room-after.webp"),
    prompt: "Create an organized home office with ergonomic desk, floor-to-ceiling bookshelf, and warm ambient light.",
  },
  {
    label: "Modern living makeover",
    before: cdn("ai-interior-design/before-after/empty-living-room-before.webp"),
    after: cdn("landing/hero-room-light.webp"),
    prompt: "Apply Japandi aesthetics with muted earth tones, low wooden furniture, and natural woven decor.",
  },
];

export const BEFORE_AFTER_INTERIOR: BeforeAfterPair[] = BEFORE_AFTER_PAIRS;

export const BEFORE_AFTER_EXTERIOR: BeforeAfterPair[] = [
  {
    label: "Dated facade redesign",
    before: cdn("ai-exterior-design/before-after/dated-facade-before.webp"),
    after: cdn("ai-exterior-design/before-after/dated-facade-after.webp"),
    prompt: "Modernize this dated suburban home exterior with dark siding, cedar accents, and warm entryway lighting.",
  },
  {
    label: "Brick contemporary transformation",
    before: cdn("ai-exterior-design/before-after/brick-contemporary-before.webp"),
    after: cdn("ai-exterior-design/before-after/brick-contemporary-after.webp"),
    prompt: "Update brick house facade with contemporary stucco, black window frames, and modern landscaping.",
  },
  {
    label: "Craftsman porch renovation",
    before: cdn("ai-exterior-design/before-after/craftsman-porch-before.webp"),
    after: cdn("ai-exterior-design/before-after/craftsman-porch-after.webp"),
    prompt: "Add a welcoming Craftsman front porch with stone pillars, wood railing, and warm lantern fixtures.",
  },
  {
    label: "Front yard curb appeal",
    before: cdn("ai-exterior-design/before-after/front-yard-before.webp"),
    after: cdn("ai-exterior-design/before-after/front-yard-after.webp"),
    prompt: "Enhance front yard landscaping with structured flower beds, pathway lighting, and lush green lawn.",
  },
  {
    label: "Backyard patio oasis",
    before: cdn("ai-exterior-design/before-after/backyard-patio-before.webp"),
    after: cdn("ai-exterior-design/before-after/backyard-patio-after.webp"),
    prompt: "Convert backyard into an outdoor living space with stone pavers, pergola, and modern fire pit lounge.",
  },
];

export const BEFORE_AFTER_FLOOR_PLAN: BeforeAfterPair[] = [
  {
    label: "Floor plan to 3D furnished room",
    before: cdn("landing/feature-floor-plan.webp"),
    after: cdn("landing/feature-render.webp"),
    prompt: "Turn 2D floor plan boundaries into a photorealistic 3D rendered living room with accurate dimensions.",
  },
  {
    label: "2D layout to walkable 360",
    before: cdn("landing/feature-room-plans.webp"),
    after: cdn("landing/feature-panorama.webp"),
    prompt: "Generate an immersive 360 panorama room preview directly from selected room marker.",
  },
  {
    label: "Architectural layout visualization",
    before: cdn("landing/feature-floor-plan.webp"),
    after: cdn("landing/feature-room-edit.webp"),
    prompt: "Render custom furniture placements and material palette on original floor plan.",
  },
  {
    label: "Master suite 3D concept",
    before: cdn("landing/feature-room-plans.webp"),
    after: cdn("landing/feature-render.webp"),
    prompt: "Visualize master bedroom suite with attached bath in Scandinavian warm tone.",
  },
  {
    label: "Open living kitchen floor plan",
    before: cdn("landing/feature-floor-plan.webp"),
    after: cdn("landing/hero-room-light.webp"),
    prompt: "Render open concept living and kitchen area from 2D architectural blueprint.",
  },
];

// ---------------------------------------------------------------------------
// Popular Styles — Interior (12 cards)
// ---------------------------------------------------------------------------

export const POPULAR_STYLES: CatalogItem[] = [
  {
    title: "Modern Warm",
    image: cdn("ai-interior-design/styles/modern-warm.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview style",
    useLabel: "Use style",
    preset: { scene: "interior", style: "Modern Warm" },
  },
  {
    title: "Japandi",
    image: cdn("ai-interior-design/styles/japandi.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview style",
    useLabel: "Use style",
    preset: { scene: "interior", style: "Japandi" },
  },
  {
    title: "Scandinavian",
    image: cdn("ai-interior-design/styles/scandinavian.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview style",
    useLabel: "Use style",
    preset: { scene: "interior", style: "Scandinavian" },
  },
  {
    title: "Minimal",
    image: cdn("ai-interior-design/styles/minimal.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview style",
    useLabel: "Use style",
    preset: { scene: "interior", style: "Minimal" },
  },
  {
    title: "Classic Warm",
    image: cdn("ai-interior-design/styles/classic-warm.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview style",
    useLabel: "Use style",
    preset: { scene: "interior", style: "Classic Warm" },
  },
  {
    title: "Industrial Loft",
    image: cdn("ai-interior-design/styles/industrial-loft.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview style",
    useLabel: "Use style",
    preset: { scene: "interior", style: "Industrial Loft" },
  },
  {
    title: "Organic Modern",
    image: cdn("ai-interior-design/styles/organic-modern.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview style",
    useLabel: "Use style",
    preset: { scene: "interior", style: "Organic Modern" },
  },
  {
    title: "Wabi-Sabi",
    image: cdn("ai-interior-design/styles/wabi-sabi.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview style",
    useLabel: "Use style",
    preset: { scene: "interior", style: "Wabi-Sabi" },
  },
  {
    title: "Mediterranean",
    image: cdn("ai-interior-design/styles/mediterranean.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview style",
    useLabel: "Use style",
    preset: { scene: "interior", style: "Mediterranean" },
  },
  {
    title: "Mid-Century",
    image: cdn("ai-interior-design/styles/mid-century.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview style",
    useLabel: "Use style",
    preset: { scene: "interior", style: "Mid-Century" },
  },
  {
    title: "French Vintage",
    image: cdn("ai-interior-design/styles/french-vintage.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview style",
    useLabel: "Use style",
    preset: { scene: "interior", style: "French Vintage" },
  },
  {
    title: "Luxury Wood",
    image: cdn("ai-interior-design/styles/luxury-wood.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview style",
    useLabel: "Use style",
    preset: { scene: "interior", style: "Luxury Wood" },
  },
];

// ---------------------------------------------------------------------------
// Ideas for Every Room — Interior (10 cards)
// ---------------------------------------------------------------------------

export const IDEAS: CatalogItem[] = [
  {
    title: "Living Room",
    image: cdn("ai-interior-design/rooms/living-room.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview",
    useLabel: "Try this look",
    preset: { scene: "interior", roomType: "Living Room" },
  },
  {
    title: "Bedroom",
    image: cdn("ai-interior-design/rooms/bedroom.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview",
    useLabel: "Try this look",
    preset: { scene: "interior", roomType: "Bedroom" },
  },
  {
    title: "Kitchen",
    image: cdn("ai-interior-design/rooms/kitchen.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview",
    useLabel: "Try this look",
    preset: { scene: "interior", roomType: "Kitchen" },
  },
  {
    title: "Home Office",
    image: cdn("ai-interior-design/rooms/home-office.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview",
    useLabel: "Try this look",
    preset: { scene: "interior", roomType: "Home Office" },
  },
  {
    title: "Dining Room",
    image: cdn("ai-interior-design/rooms/dining-room.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview",
    useLabel: "Try this look",
    preset: { scene: "interior", roomType: "Dining Room" },
  },
  {
    title: "Bathroom",
    image: cdn("ai-interior-design/rooms/bathroom.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview",
    useLabel: "Try this look",
    preset: { scene: "interior", roomType: "Bathroom" },
  },
  {
    title: "Kids Room",
    image: cdn("ai-interior-design/rooms/kids-room.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview",
    useLabel: "Try this look",
    preset: { scene: "interior", roomType: "Kids Room" },
  },
  {
    title: "Nursery",
    image: cdn("ai-interior-design/rooms/nursery.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview",
    useLabel: "Try this look",
    preset: { scene: "interior", roomType: "Nursery" },
  },
  {
    title: "Entryway",
    image: cdn("ai-interior-design/rooms/entryway.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview",
    useLabel: "Try this look",
    preset: { scene: "interior", roomType: "Entryway" },
  },
  {
    title: "Balcony",
    image: cdn("ai-interior-design/rooms/balcony.webp"),
    href: "/ai-interior-design",
    previewLabel: "Preview",
    useLabel: "Try this look",
    preset: { scene: "interior", roomType: "Balcony" },
  },
];

// ---------------------------------------------------------------------------
// Exterior Styles (12 cards)
// ---------------------------------------------------------------------------

export const EXTERIOR_STYLES: CatalogItem[] = [
  {
    title: "Modern",
    image: cdn("ai-exterior-design/styles/modern.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", style: "Modern" },
  },
  {
    title: "Modern Farmhouse",
    image: cdn("ai-exterior-design/styles/modern-farmhouse.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", style: "Modern Farmhouse" },
  },
  {
    title: "Contemporary",
    image: cdn("ai-exterior-design/styles/contemporary.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", style: "Contemporary" },
  },
  {
    title: "Mediterranean",
    image: cdn("ai-exterior-design/styles/mediterranean.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", style: "Mediterranean" },
  },
  {
    title: "Colonial",
    image: cdn("ai-exterior-design/styles/colonial.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", style: "Colonial" },
  },
  {
    title: "Craftsman",
    image: cdn("ai-exterior-design/styles/craftsman.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", style: "Craftsman" },
  },
  {
    title: "Ranch",
    image: cdn("ai-exterior-design/styles/ranch.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", style: "Ranch" },
  },
  {
    title: "Scandinavian",
    image: cdn("ai-exterior-design/styles/scandinavian.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", style: "Scandinavian" },
  },
  {
    title: "Mid-Century",
    image: cdn("ai-exterior-design/styles/mid-century.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", style: "Mid-Century" },
  },
  {
    title: "Coastal",
    image: cdn("ai-exterior-design/styles/coastal.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", style: "Coastal" },
  },
  {
    title: "Cottage",
    image: cdn("ai-exterior-design/styles/cottage.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", style: "Cottage" },
  },
  {
    title: "Tudor",
    image: cdn("ai-exterior-design/styles/tudor.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", style: "Tudor" },
  },
];

export const EXTERIOR_POPULAR_STYLES = EXTERIOR_STYLES;

// ---------------------------------------------------------------------------
// Ideas for Every Exterior Area (10 cards)
// ---------------------------------------------------------------------------

export const EXTERIOR_AREAS: CatalogItem[] = [
  {
    title: "House Facade",
    image: cdn("ai-exterior-design/areas/house-facade.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", area: "House Facade" },
  },
  {
    title: "Front Entrance",
    image: cdn("ai-exterior-design/areas/front-entrance.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", area: "Front Entrance" },
  },
  {
    title: "Front Porch",
    image: cdn("ai-exterior-design/areas/front-porch.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", area: "Front Porch" },
  },
  {
    title: "Front Yard",
    image: cdn("ai-exterior-design/areas/front-yard.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", area: "Front Yard" },
  },
  {
    title: "Backyard",
    image: cdn("ai-exterior-design/areas/backyard.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", area: "Backyard" },
  },
  {
    title: "Patio",
    image: cdn("ai-exterior-design/areas/patio.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", area: "Patio" },
  },
  {
    title: "Deck",
    image: cdn("ai-exterior-design/areas/deck.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", area: "Deck" },
  },
  {
    title: "Garage",
    image: cdn("ai-exterior-design/areas/garage.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", area: "Garage" },
  },
  {
    title: "Driveway",
    image: cdn("ai-exterior-design/areas/driveway.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", area: "Driveway" },
  },
  {
    title: "Garden",
    image: cdn("ai-exterior-design/areas/garden.webp"),
    href: "/ai-exterior-design",
    previewLabel: "Preview area idea",
    useLabel: "Try this look",
    preset: { scene: "exterior", area: "Garden" },
  },
];

export const EXTERIOR_IDEAS = EXTERIOR_AREAS;

// ---------------------------------------------------------------------------
// Pricing Tiers (Matching Origin & Test Suite)
// ---------------------------------------------------------------------------

export const PRICING_TIERS: PricingTier[] = [
  {
    name: "Lite",
    price: "$5",
    priceNote: "Mock purchase (no charge)",
    credits: 80,
    description: "For trying one or two room designs",
    cta: "Buy Credits",
    features: ["80 credits", "Credits valid for 30 days"],
  },
  {
    name: "Plus",
    price: "$9",
    originalPrice: "$10",
    priceNote: "Mock purchase (no charge)",
    credits: 160,
    description: "For one complete design project",
    cta: "Buy Credits",
    features: [
      "160 credits",
      "10% off",
      "Credits valid for 60 days",
      "Enough for a typical 7-room home",
    ],
  },
  {
    name: "Pro",
    price: "$17",
    originalPrice: "$20",
    priceNote: "Mock purchase (no charge)",
    credits: 320,
    description: "For more styles, revisions, and rooms",
    cta: "Buy Credits",
    badge: "Popular",
    features: [
      "320 credits",
      "15% off",
      "Credits valid for 90 days",
      "Great for comparing design directions",
    ],
  },
  {
    name: "Max",
    price: "$32",
    originalPrice: "$40",
    priceNote: "Mock purchase (no charge)",
    credits: 640,
    description: "For multiple homes or larger projects",
    cta: "Buy Credits",
    badge: "Best Value",
    features: [
      "640 credits",
      "20% off",
      "Credits valid for 180 days",
      "Best value for larger projects",
    ],
  },
];

// ---------------------------------------------------------------------------
// Helper: URL with query preset
// ---------------------------------------------------------------------------

export function buildCatalogPresetHref(item: CatalogItem): string {
  if (!item.preset) return item.href;
  const basePath = item.preset.scene === "exterior" ? "/ai-exterior-design" : "/ai-interior-design";
  const params = new URLSearchParams();
  if (item.preset.style) params.set("style", item.preset.style);
  if (item.preset.roomType) params.set("roomType", item.preset.roomType);
  if (item.preset.area) params.set("area", item.preset.area);
  if (item.preset.colorScheme) params.set("colorScheme", item.preset.colorScheme);
  if (item.preset.aspectRatio) params.set("aspectRatio", item.preset.aspectRatio);
  const q = params.toString();
  return q ? `${basePath}?${q}` : basePath;
}

// ---------------------------------------------------------------------------
// FAQ Datasets (English only clean ASCII)
// ---------------------------------------------------------------------------

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What should I upload?",
    answer:
      "A clear photo of a room, a house exterior, or an existing floor plan - whichever matches your project. Good lighting and a straight-on angle help the AI read the space accurately. For best results, use an image of at least 1024 pixels on the longest side, keep the whole space in frame, and avoid heavy filters.",
  },
  {
    question: "Which tool should I start with?",
    answer:
      "If you already have a floor plan, AI Floor Plan turns a selected room into a 2D furniture layout, a photorealistic render, or an optional 360 view. Working from a photo instead? Use AI Interior Design for rooms and AI Exterior Design for the outside of the house.",
  },
  {
    question: "Can I change just one part of a design?",
    answer:
      "Yes. Mark the area you want to change using Local Edit and describe the edit - a different sofa, a warmer wall color, new flooring. The AI regenerates only that region.",
  },
  {
    question: "How long does a generation take?",
    answer:
      "Most room concepts and exterior redesigns take around 30-60 seconds. High-resolution renders or 360 panoramas can take 1-2 minutes depending on model load.",
  },
  {
    question: "Do my credits expire?",
    answer:
      "Credits remain valid for 30 to 180 days depending on your purchased package. Free trial credits do not expire.",
  },
];

export const FAQ_INTERIOR: FaqItem[] = [
  {
    question: "How does AI Interior Design work?",
    answer:
      "Upload a room photo, choose the room type, design style, and color palette. HomeDesign sends those settings with your image to the AI image model and returns your AI interior design preview in seconds.",
  },
  {
    question: "What room photos work best?",
    answer:
      "Use a well-lit photo that shows the whole room. Natural light, a straight camera angle, clear walls, and minimal clutter help the AI understand the layout.",
  },
  {
    question: "Will AI change my room layout?",
    answer:
      "The prompt asks AI to keep walls, doors, windows, and the main structure intact while updating furniture, materials, lighting, colors, and decor.",
  },
  {
    question: "Can I customize the result?",
    answer:
      "Yes. Use Custom Requirements to mention what should stay, what should change, furniture preferences, colors to avoid, or materials you like.",
  },
];

export const FAQ_EXTERIOR: FaqItem[] = [
  {
    question: "How does AI Exterior Design work?",
    answer:
      "Upload a photo of your house or outdoor area, choose the exterior zone, architectural style, materials, and color palette. The AI model renders realistic exterior redesigns while keeping your home's rooflines and proportions intact.",
  },
  {
    question: "What exterior photos give the best results?",
    answer:
      "Clear daytime photos with good lighting, showing the entire facade or outdoor area without extreme wide-angle distortion.",
  },
  {
    question: "Can I remodel just the front porch or patio?",
    answer:
      "Yes! You can select specific exterior areas like Front Porch, Patio, Deck, Backyard, or Garage, or use Local Edit to brush specific sections.",
  },
];

export const FAQ_FLOOR_PLAN: FaqItem[] = [
  {
    question: "What kind of floor plan should I upload?",
    answer:
      "Upload a clear floor plan image, scan, screenshot, or straight-on phone photo. Results work best when room boundaries, doors, windows, and labels are easy to see.",
  },
  {
    question: "Will HomeDesign keep my real room shape?",
    answer:
      "HomeDesign uses your uploaded floor plan as the starting point. The selected room, proportions, and visible openings guide the layout, render, and optional 360 view.",
  },
  {
    question: "What happens after I select a room?",
    answer:
      "HomeDesign generates a 2D furniture layout, a realistic room render, and an optional 360 panorama for the selected room. You can compare the results and refine a selected area.",
  },
  {
    question: "Which rooms work best right now?",
    answer:
      "Living rooms, bedrooms, kitchens, dining areas, home offices, and open floor concepts produce the most photorealistic renders and 360 previews.",
  },
];
