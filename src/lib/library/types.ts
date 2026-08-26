import type { DesignScene } from "@/lib/ai/types";

export interface ProjectListItem {
  id: string;
  name: string;
  kind: DesignScene;
  status: string;
  favorite: boolean;
  visibility: string;
  createdAt: number;
  updatedAt: number;
  sourceAssetId: string | null;
}

export interface AssetListItem {
}

export interface AssetListItem {
  id: string;
  name: string;
  mimeType: string;
  lifecycle: string;
  createdAt: number;
  updatedAt: number;
  refCount: number;
  isSource: boolean;
  isGenerated: boolean;
}

export interface ActivityEvent {
  eventId: string;
  family: "project" | "asset" | "generation" | "payment";
  type: string;
  occurredAt: number;
  referenceId: string;
  actorUserId: string;
  name: string;
  kind: string;
  status: string;
  detail: string | number | null;
}

export interface ListResult<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ProjectFilters {
  kind?: "interior" | "exterior" | "floor-plan" | null;
  favorite?: boolean | null;
  visibility?: string | null;
  search?: string | null;
  sort?: "updated-desc" | "created-desc" | "name-asc" | null;
}

export interface AssetFilters {
  type?: "source" | "generated" | "all" | null;
  lifecycle?: string | null;
  projectId?: string | null;
  search?: string | null;
  sort?: "updated-desc" | "created-desc" | "name-asc" | null;
}

export interface ActivityFilters {
  family?: "project" | "asset" | "generation" | "payment" | null;
}
