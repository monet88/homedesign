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

export type StageRunStatus = "draft" | "processing" | "success" | "failed" | "confirmed";

export interface StageRunView {
  id: string;
  stage: "brief" | "layout" | "render" | "panorama";
  status: StageRunStatus;
  designId: string | null;
  confirmedAt: number | null;
  stale: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ProcessingTaskView {
  designId: string;
  stage: StageRunView["stage"];
  roomDesignId: string;
}

export interface ProjectOverview {
  markedAreas: number;
  completeRooms: number;
  currentRoomId: string | null;
}

export interface RoomDesignDetailView extends RoomDesignView {
  stageRuns: StageRunView[];
  complete: boolean;
}

export interface FloorPlanProjectDetailView {
  id: string;
  sourceAssetId: string;
  overview: ProjectOverview;
  rooms: RoomDesignDetailView[];
  processingTasks: ProcessingTaskView[];
}
