import type { Env } from "@/lib/bindings";
import type { MarkerPosition, QuestionnaireItem, RoomRecognitionResult } from "@/lib/floor-plan/types";

const ROOM_TYPES = [
  "bedroom",
  "living room",
  "kitchen",
  "bathroom",
  "dining room",
  "home office",
] as const;

function roomTypeForMarker(marker: MarkerPosition): string {
  const idx = Math.floor((marker.x + marker.y) / 34) % ROOM_TYPES.length;
  return ROOM_TYPES[idx];
}

/**
 * Deterministic recognition from marker region + optional asset metadata.
 * Never fabricates measurements — dimensions only when width/height exist on asset.
 */
export async function recognizeRoomRegion(
  env: Env,
  sourceAssetId: string,
  marker: MarkerPosition
): Promise<RoomRecognitionResult> {
  const asset = await env.DB.prepare(`SELECT width, height FROM assets WHERE id = ?1`)
    .bind(sourceAssetId)
    .first<{ width: number | null; height: number | null }>();

  const roomType = roomTypeForMarker(marker);
  const result: RoomRecognitionResult = {
    roomType,
    openings: marker.x < 50 ? ["door-left", "window-right"] : ["door-right", "window-left"],
    shape: marker.y < 50 ? "rectangular" : "L-shaped",
    regionHint: `region at (${marker.x}%, ${marker.y}%)`,
  };

  if (asset?.width && asset?.height) {
    result.dimensions = {
      widthPx: asset.width,
      heightPx: asset.height,
      source: "asset-metadata",
    };
  }

  return result;
}

export function questionnaireForRoomType(roomType: string): QuestionnaireItem[] {
  return [
    {
      id: "primary-use",
      question: `How do you primarily use this ${roomType}?`,
      options: ["Relaxing", "Entertaining", "Working", "Multi-purpose"],
    },
    {
      id: "light-preference",
      question: "What lighting mood do you prefer?",
      options: ["Bright and airy", "Warm and cozy", "Dramatic accent"],
    },
  ];
}

export function buildDesignProposal(
  recognition: RoomRecognitionResult,
  style?: string
): string {
  const stylePart = style ? ` in a ${style} direction` : "";
  return `Design a ${recognition.roomType}${stylePart} for the ${recognition.regionHint}, respecting ${recognition.shape} layout and ${recognition.openings.join(", ")}.`;
}
