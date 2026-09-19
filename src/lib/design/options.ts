// Design-flow option lists (ticket #14). These are the UI labels sent to the
// server as free text; the prompt builder applies the origin fallback rules.

export const DESIGN_MODES = [
  { value: "redesign" as const, label: "Full Redesign" },
  { value: "virtual-staging" as const, label: "Virtual Staging" },
  { value: "edit" as const, label: "Local Edit" },
] as const;

export type DesignModeValue = (typeof DESIGN_MODES)[number]["value"];

export interface B2BStagingPreset {
  id: string;
  name: string;
  description: string;
  roomType: string;
  style: string;
  colorScheme: string;
  recommendedAspect: string;
  highlights: string[];
}

export const B2B_STAGING_PRESETS: B2BStagingPreset[] = [
  {
    id: "living-room-luxury",
    name: "Living Room Luxury",
    description:
      "Transform empty spaces into high-end turnkey living rooms with Italian leather/boucle seating, marble centerpieces, and warm ambient lighting.",
    roomType: "Living Room",
    style: "Modern Warm",
    colorScheme: "Warm",
    recommendedAspect: "16:9",
    highlights: [
      "Italian leather or boucle seating",
      "Marble & brass nesting tables",
      "Layered 2700K designer lighting",
      "Large textured wool area rug",
    ],
  },
  {
    id: "modern-bedroom",
    name: "Modern Bedroom",
    description:
      "Stage vacant bedrooms into serene master suites with channel-tufted king beds, luxury layered linen bedding, and walnut accents.",
    roomType: "Bedroom",
    style: "Scandinavian",
    colorScheme: "Neutral",
    recommendedAspect: "4:3",
    highlights: [
      "Channel-tufted king platform bed",
      "5-star hotel layered linen bedding",
      "Symmetrical walnut nightstands & pendants",
      "Cozy window reading armchair",
    ],
  },
  {
    id: "executive-office",
    name: "Executive Office",
    description:
      "Convert empty rooms into elite executive offices with solid hardwood desks, ergonomic leather seating, and floor-to-ceiling library shelving.",
    roomType: "Home Office",
    style: "Industrial Loft",
    colorScheme: "Earth",
    recommendedAspect: "16:9",
    highlights: [
      "Solid oak/walnut executive desk",
      "High-back ergonomic leather chair",
      "Curated architectural open shelving",
      "Architectural task lighting & city art",
    ],
  },
];

export const INTERIOR_ROOM_TYPES = [
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
] as const;

export const EXTERIOR_AREAS = [
  "House Facade",
  "Front Porch",
  "Backyard",
  "Front Yard",
  "Patio",
  "Driveway",
  "Garden",
] as const;

export const INTERIOR_STYLES = [
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
] as const;

export const EXTERIOR_STYLES = [
  "Modern",
  "Modern Farmhouse",
  "Contemporary",
  "Colonial",
  "Craftsman",
  "Mediterranean",
  "Minimal",
  "Industrial",
] as const;

export const INTERIOR_PALETTES = [
  "Neutral",
  "Warm",
  "Cool",
  "Earth",
  "Custom",
] as const;

export const EXTERIOR_PALETTES = [
  "Classic White",
  "Warm Earth",
  "Modern Dark",
  "Coastal Light",
  "Custom",
] as const;

export const ASPECT_RATIO_OPTIONS = [
  "1:1",
  "4:3",
  "16:9",
  "3:4",
  "9:16",
] as const;
