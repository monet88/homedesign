// Studio Custom Styling Presets (Ticket 8.3)
import type { Env } from "@/lib/bindings";

export interface CustomPreset {
  id: string;
  workspaceId?: string | null;
  userId: string;
  name: string;
  description?: string | null;
  scene: "interior" | "exterior" | "floor-plan" | "all";
  roomType?: string | null;
  baseStyle?: string | null;
  colorPalette?: string | null;
  preferredMaterials?: string[];
  customPromptAdditions?: string | null;
  negativePromptAdditions?: string | null;
  thumbnailUrl?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateCustomPresetInput {
  name: string;
  description?: string;
  workspaceId?: string | null;
  scene?: "interior" | "exterior" | "floor-plan" | "all";
  roomType?: string;
  baseStyle?: string;
  colorPalette?: string;
  preferredMaterials?: string[];
  customPromptAdditions?: string;
  negativePromptAdditions?: string;
  thumbnailUrl?: string;
}

function uid(): string {
  return crypto.randomUUID();
}

export async function createCustomPreset(
  env: Env,
  userId: string,
  input: CreateCustomPresetInput
): Promise<CustomPreset> {
  const name = input.name?.trim();
  if (!name) throw new Error("PRESET_NAME_REQUIRED");
  if (input.workspaceId) {
    const member = await env.DB.prepare(
      `SELECT role FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2`
    )
      .bind(input.workspaceId, userId)
      .first<{ role: string }>();
    if (!member) throw new Error("PRESET_FORBIDDEN");
    if (member.role === "viewer") throw new Error("ROLE_CANNOT_CREATE_PRESET");
  }

  const id = uid();
  const now = Date.now();
  const scene = input.scene || "all";
  const materialsJson = input.preferredMaterials?.length
    ? JSON.stringify(input.preferredMaterials)
    : null;

  await env.DB.prepare(
    `INSERT INTO custom_presets (
       id, workspace_id, user_id, name, description, scene, room_type, base_style,
       color_palette, preferred_materials, custom_prompt_additions, negative_prompt_additions,
       thumbnail_url, created_at, updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`
  ).bind(
    id,
    input.workspaceId ?? null,
    userId,
    name,
    input.description?.trim() ?? null,
    scene,
    input.roomType?.trim() ?? null,
    input.baseStyle?.trim() ?? null,
    input.colorPalette?.trim() ?? null,
    materialsJson,
    input.customPromptAdditions?.trim() ?? null,
    input.negativePromptAdditions?.trim() ?? null,
    input.thumbnailUrl?.trim() ?? null,
    now,
    now
  ).run();

  return {
    id,
    workspaceId: input.workspaceId ?? null,
    userId,
    name,
    description: input.description?.trim() ?? null,
    scene,
    roomType: input.roomType?.trim() ?? null,
    baseStyle: input.baseStyle?.trim() ?? null,
    colorPalette: input.colorPalette?.trim() ?? null,
    preferredMaterials: input.preferredMaterials ?? [],
    customPromptAdditions: input.customPromptAdditions?.trim() ?? null,
    negativePromptAdditions: input.negativePromptAdditions?.trim() ?? null,
    thumbnailUrl: input.thumbnailUrl?.trim() ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listCustomPresets(
  env: Env,
  userId: string,
  workspaceId?: string | null,
  scene?: string
): Promise<CustomPreset[]> {
  // Multi-tenant boundary: workspace presets are only visible to members of
  // that workspace. Without this gate any verified user could enumerate a
  // studio's private styling directives by guessing its workspace id.
  if (workspaceId) {
    const member = await env.DB.prepare(
      `SELECT role FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2`
    )
      .bind(workspaceId, userId)
      .first<{ role: string }>();
    if (!member) throw new Error("PRESET_FORBIDDEN");
  }

  let sql = `
    SELECT * FROM custom_presets
    WHERE (user_id = ?1 OR (workspace_id IS NOT NULL AND workspace_id = ?2))
  `;
  const params: (string | null)[] = [userId, workspaceId ?? null];

  if (scene && scene !== "all") {
    sql += ` AND (scene = 'all' OR scene = ?3)`;
    params.push(scene);
  }

  sql += ` ORDER BY created_at DESC`;

  const result = await env.DB.prepare(sql).bind(...params).all<{
    id: string;
    workspace_id: string | null;
    user_id: string;
    name: string;
    description: string | null;
    scene: string;
    room_type: string | null;
    base_style: string | null;
    color_palette: string | null;
    preferred_materials: string | null;
    custom_prompt_additions: string | null;
    negative_prompt_additions: string | null;
    thumbnail_url: string | null;
    created_at: number;
    updated_at: number;
  }>();

  return (result.results ?? []).map((row) => {
    let materials: string[] = [];
    if (row.preferred_materials) {
      try {
        materials = JSON.parse(row.preferred_materials);
      } catch {
        materials = [];
      }
    }
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      scene: row.scene as CustomPreset["scene"],
      roomType: row.room_type,
      baseStyle: row.base_style,
      colorPalette: row.color_palette,
      preferredMaterials: materials,
      customPromptAdditions: row.custom_prompt_additions,
      negativePromptAdditions: row.negative_prompt_additions,
      thumbnailUrl: row.thumbnail_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export async function getCustomPreset(
  env: Env,
  presetId: string,
  userId: string
): Promise<CustomPreset> {
  const row = await env.DB.prepare(
    `SELECT * FROM custom_presets WHERE id = ?1`
  ).bind(presetId).first<{
    id: string;
    workspace_id: string | null;
    user_id: string;
    name: string;
    description: string | null;
    scene: string;
    room_type: string | null;
    base_style: string | null;
    color_palette: string | null;
    preferred_materials: string | null;
    custom_prompt_additions: string | null;
    negative_prompt_additions: string | null;
    thumbnail_url: string | null;
    created_at: number;
    updated_at: number;
  }>();

  if (!row) throw new Error("PRESET_NOT_FOUND");

  // Multi-tenant authorization check: user must be owner or workspace member
  if (row.user_id !== userId) {
    if (row.workspace_id) {
      const member = await env.DB.prepare(
        `SELECT role FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2`
      ).bind(row.workspace_id, userId).first<{ role: string }>();
      if (!member) {
        throw new Error("PRESET_FORBIDDEN");
      }
    } else {
      throw new Error("PRESET_FORBIDDEN");
    }
  }

  let materials: string[] = [];
  if (row.preferred_materials) {
    try {
      materials = JSON.parse(row.preferred_materials);
    } catch {
      materials = [];
    }
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    scene: row.scene as CustomPreset["scene"],
    roomType: row.room_type,
    baseStyle: row.base_style,
    colorPalette: row.color_palette,
    preferredMaterials: materials,
    customPromptAdditions: row.custom_prompt_additions,
    negativePromptAdditions: row.negative_prompt_additions,
    thumbnailUrl: row.thumbnail_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteCustomPreset(
  env: Env,
  presetId: string,
  userId: string
): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT * FROM custom_presets WHERE id = ?1`
  ).bind(presetId).first<{ id: string; user_id: string; workspace_id: string | null }>();

  if (!row) throw new Error("PRESET_NOT_FOUND");

  // Check permission: author or workspace owner
  if (row.user_id !== userId) {
    if (row.workspace_id) {
      const isOwner = await env.DB.prepare(
        `SELECT 1 FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2 AND role = 'owner'`
      ).bind(row.workspace_id, userId).first();
      if (!isOwner) throw new Error("FORBIDDEN");
    } else {
      throw new Error("FORBIDDEN");
    }
  }

  await env.DB.prepare(`DELETE FROM custom_presets WHERE id = ?1`).bind(presetId).run();
}

/**
 * Format custom styling preset additions into prompt lines.
 */
export function formatPresetPromptAdditions(preset: CustomPreset): string {
  const parts: string[] = [];
  if (preset.preferredMaterials && preset.preferredMaterials.length > 0) {
    parts.push(`- Preferred materials and finishes: ${preset.preferredMaterials.join(", ")}`);
  }
  if (preset.customPromptAdditions) {
    parts.push(`- Studio architectural directive: ${preset.customPromptAdditions}`);
  }
  return parts.join("\n");
}
