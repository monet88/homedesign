export { FloorPlanError, type FloorPlanErrorCode } from "@/lib/floor-plan/errors";
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
  assertRoomDesignForRender,
  confirmRoomLayout,
  confirmRoomRender,
  createStageRun,
  completeStageRun,
  failStageRun,
  getActiveConfirmedStageRun,
  getStageRunByDesignId,
  isStageRunStale,
  parseRoomProposal,
} from "@/lib/floor-plan/stages";
export {
  recognizeRoomRegion,
  questionnaireForRoomType,
  buildDesignProposal,
} from "@/lib/floor-plan/recognition";
export type {
  FloorPlanProjectView,
  MarkerPosition,
  RoomBriefProposal,
  RoomDesignProgress,
  RoomDesignView,
  RoomRecognitionResult,
  QuestionnaireItem,
} from "@/lib/floor-plan/types";
