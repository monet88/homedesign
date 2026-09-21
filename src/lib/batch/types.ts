// Batch AI Rendering Queue Types (Sprint 9 - Ticket 9.2)

export type BatchRenderStatus = "pending" | "processing" | "completed" | "failed" | "partial";

export interface BatchItemPayload {
  scene: string;
  roomType: string;
  prompt: string;
  sourceAssetId?: string | null;
  sourceKey?: string | null;
  presetId?: string | null;
  options?: Record<string, unknown>;
}

export interface BatchItemProgress {
  taskId: string;
  roomType: string;
  status: string;
  scene: string;
  prompt: string;
  costCredits: number;
  resultKey?: string | null;
  thumbnailUrl?: string | null;
}

export interface BatchRenderJob {
  id: string;
  workspaceId?: string | null;
  userId: string;
  name: string;
  status: BatchRenderStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  totalCreditsCost: number;
  createdAt: number;
  updatedAt: number;
  items?: BatchItemProgress[];
}

export interface CreateBatchRenderParams {
  workspaceId?: string | null;
  userId: string;
  name: string;
  items: BatchItemPayload[];
  provider?: string; // 'fal' or 'gemini'
}
