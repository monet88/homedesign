export { FloorPlanError, type FloorPlanErrorCode } from "@/lib/floor-plan/errors";
export {
  resolveFloorPlanStagePlan,
  handleFloorPlanTerminal,
  type ResolvedFloorPlanStagePlan,
} from "@/lib/floor-plan/facade";
export { createFloorPlanProject } from "@/lib/floor-plan/project";
export {
  placeRoomMarker,
  updateRoomMarker,
  getRoomDesign,
  addNextRoomMarker,
} from "@/lib/floor-plan/markers";
export {
  proposeRoomBrief,
  confirmRoomBrief,
  createBriefStageRun,
  completeBriefStageRun,
  assertLayoutStageAllowed,
  assertRoomDesignForBrief,
} from "@/lib/floor-plan/brief";
export {
  assertNoProcessingRun,
  assertRenderStageAllowed,
  assertRoomDesignForLayout,
  assertRoomDesignForPanorama,
  assertRoomDesignForRender,
  assertPanoramaStageAllowed,
  confirmRoomLayout,
  confirmRoomRender,
  createStageRun,
  completeStageRun,
  failStageRun,
  getActiveConfirmedStageRun,
  getStageRunByDesignId,
  isStageRunStale,
  parseRoomProposal,
  restoreStageRun,
} from "@/lib/floor-plan/stages";
export {
  deriveProjectOverview,
  getFloorPlanProjectDetail,
  isRoomDesignComplete,
} from "@/lib/floor-plan/overview";
export {
  recognizeRoomRegion,
  questionnaireForRoomType,
  buildDesignProposal,
} from "@/lib/floor-plan/recognition";
export type {
  FloorPlanProjectView,
  FloorPlanProjectDetailView,
  MarkerPosition,
  ProcessingTaskView,
  ProjectOverview,
  RoomBriefProposal,
  RoomDesignDetailView,
  RoomDesignProgress,
  RoomDesignView,
  RoomRecognitionResult,
  QuestionnaireItem,
  StageRunStatus,
  StageRunView,
  PanoramaOrientationView,
} from "@/lib/floor-plan/types";
