// Negative constraints preventing distorted geometry, unwanted elements, and visual artifacts (Ticket #26).

export const DEFAULT_NEGATIVE_CONSTRAINTS = [
  "Strictly avoid:",
  "warped structural lines, crooked walls, misaligned doors or windows, impossible geometry, non-vertical perspective distortion, fisheye curvature, floating furniture, severed structures,",
  "cartoon rendering, 3D CGI plastic look, surreal illustrations, video game aesthetic, oversaturated artificial colors, low resolution, blurry textures, pixelated surfaces, jpeg compression artifacts,",
  "duplicate openings, mutated architectural elements, asymmetrical window frames, misplaced structural columns,",
  "people, human figures, faces, hands, silhouettes, animals, pets, clutter, trash, vehicles inside interiors,",
  "text, logos, labels, captions, watermarks, frame borders, split screens, multiple panels, collage compositions.",
].join(" ");

export function getNegativeConstraints(): string {
  return DEFAULT_NEGATIVE_CONSTRAINTS;
}

