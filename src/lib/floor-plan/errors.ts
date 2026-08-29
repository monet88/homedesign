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

export function isStageRunProcessingConflict(err: unknown): boolean {
  if (!err) return false;
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    message.includes("idx_fp_stage_runs_processing") ||
    (message.includes("unique constraint failed") && message.includes("floor_plan_stage_runs"))
  );
}
