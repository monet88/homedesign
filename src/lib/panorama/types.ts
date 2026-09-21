import { z } from "zod";

export interface PanoramaHotspot {
  id: string;
  sceneId: string;
  targetSceneId: string | null;
  type: "scene" | "info";
  pitch: number; // -90 to 90
  yaw: number;   // -180 to 180
  title: string;
  description: string | null;
  createdAt: number;
}

export interface PanoramaScene {
  id: string;
  tourId: string;
  name: string;
  assetId: string;
  initialYaw: number;
  initialPitch: number;
  initialHfov: number;
  orderIndex: number;
  createdAt: number;
  hotspots?: PanoramaHotspot[];
}

export interface PanoramaTour {
  id: string;
  workspaceId: string | null;
  projectId: string | null;
  userId: string;
  title: string;
  description: string | null;
  firstSceneId: string | null;
  isPublic: boolean;
  shareToken: string;
  createdAt: number;
  updatedAt: number;
  scenes?: PanoramaScene[];
}

export const CreateTourSchema = z.object({
  title: z.string().trim().min(1, "Tên tour không được để trống").max(120, "Tên tour tối đa 120 ký tự"),
  description: z.string().trim().max(1000, "Mô tả tối đa 1000 ký tự").nullable().optional(),
  workspaceId: z.string().trim().nullable().optional(),
  projectId: z.string().trim().nullable().optional(),
  isPublic: z.boolean().optional().default(false),
});

export const UpdateTourSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  firstSceneId: z.string().trim().nullable().optional(),
  isPublic: z.boolean().optional(),
});

export const CreateSceneSchema = z.object({
  name: z.string().trim().min(1).max(80),
  assetId: z.string().trim().min(1),
  initialYaw: z.number().min(-180).max(180).default(0),
  initialPitch: z.number().min(-90).max(90).default(0),
  initialHfov: z.number().min(30).max(140).default(100),
  orderIndex: z.number().int().min(0).optional(),
});

export const CreateHotspotSchema = z.object({
  sceneId: z.string().trim().min(1),
  targetSceneId: z.string().trim().optional().nullable(),
  type: z.enum(["scene", "info"]),
  pitch: z.number().min(-90).max(90),
  yaw: z.number().min(-180).max(180),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().nullable(),
});

export type CreateTourInput = z.input<typeof CreateTourSchema>;
export type UpdateTourInput = z.infer<typeof UpdateTourSchema>;
export type CreateSceneInput = z.input<typeof CreateSceneSchema>;
export type CreateHotspotInput = z.infer<typeof CreateHotspotSchema>;
