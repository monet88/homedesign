// Negative constraints preventing distorted geometry, unwanted elements, and visual artifacts.

export const DEFAULT_NEGATIVE_CONSTRAINTS = [
  "Strictly avoid:",
  "blurry textures, low resolution, pixelated surfaces, jpeg artifacts,",
  "warped structural lines, crooked walls, misaligned doors or windows, impossible geometry,",
  "cartoon rendering, 3D CGI plastic look, surreal illustrations,",
  "people, silhouettes, animals, clutter, vehicles inside interiors,",
  "text, logos, labels, captions, watermarks, frame borders, split screens.",
].join(" ");

export function getNegativeConstraints(): string {
  return DEFAULT_NEGATIVE_CONSTRAINTS;
}
