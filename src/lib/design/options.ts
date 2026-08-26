// Design-flow option lists (ticket #14). These are the UI labels sent to the
// server as free text; the prompt builder applies the origin fallback rules.

export const DESIGN_MODES = [
  { value: "redesign" as const, label: "Full Redesign" },
  { value: "edit" as const, label: "Local Edit" },
] as const;

export type DesignModeValue = (typeof DESIGN_MODES)[number]["value"];

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
