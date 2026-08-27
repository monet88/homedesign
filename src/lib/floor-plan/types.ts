/** Normalized marker in 0–100 space (ADR 0004). */
export interface MarkerPosition {
  x: number;
  y: number;
}

export type RoomDesignProgress =
  | "draft"
  | "analyzed"
  | "layout-ready"
  | "render-ready"
  | "panorama-ready"
  | "complete";

/** Recognition output — dimensions only when readable from source metadata. */
export interface RoomRecognitionResult {
  roomType: string;
  openings: string[];
  shape: string;
  /** Pixel dimensions from asset metadata when readable — never fabricated. */
  dimensions?: { widthPx: number; heightPx: number; source: "asset-metadata" };
  regionHint: string;
}

export interface QuestionnaireItem {
  id: string;
  question: string;
  options?: string[];
}

export interface RoomBriefProposal {
  recognition: RoomRecognitionResult;
  style?: string;
  stylePreference?: string;
  questionnaire: QuestionnaireItem[];
  freeformRequirements?: string;
  designProposal: string;
}

export interface FloorPlanProjectView {
  id: string;
  sourceAssetId: string;
  created: boolean;
}

export interface RoomDesignView {
  id: string;
  projectId: string;
  markerId: string;
  marker: MarkerPosition;
  markerLocked: boolean;
  briefConfirmedAt: number | null;
  progress: RoomDesignProgress;
  proposal: RoomBriefProposal | null;
}
