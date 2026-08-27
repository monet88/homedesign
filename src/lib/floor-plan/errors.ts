export type FloorPlanErrorCode =
  | "NOT_FOUND"
  | "ASSET_NOT_FOUND"
  | "FORBIDDEN"
  | "SOURCE_ASSET_NOT_READY"
  | "INVALID_MARKER"
  | "MARKER_LOCKED"
  | "BRIEF_NOT_CONFIRMED"
  | "BRIEF_NOT_READY"
  | "LAYOUT_NOT_CONFIRMED"
  | "RENDER_NOT_CONFIRMED"
  | "STAGE_NOT_READY"
  | "STAGE_PROCESSING"
  | "PROJECT_SOURCE_MISMATCH";

export class FloorPlanError extends Error {
  readonly code: FloorPlanErrorCode;
  readonly status: number;
  readonly reason?: string;

  constructor(code: FloorPlanErrorCode, status: number, reason?: string) {
    super(code);
    this.name = "FloorPlanError";
    this.code = code;
    this.status = status;
    this.reason = reason;
  }
}
