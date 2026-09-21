// White-Label Studio Branding & Watermark Service (Sprint 9 - Ticket 9.3)

import type { Env } from "@/lib/bindings";
import type { StudioBranding, UpdateBrandingInput } from "./types";
import { getWorkspace } from "@/lib/workspaces/workspaces";
import { recordWorkspaceAuditLog } from "@/lib/audit/audit-logger";

interface WorkspaceBrandingRow {
  id: string;
  name: string;
  brand_logo_url: string | null;
  brand_name: string | null;
  brand_tagline: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_address: string | null;
  watermark_enabled: number;
  watermark_text: string | null;
  watermark_position: string | null;
}

export async function getWorkspaceBranding(
  env: Env,
  workspaceId: string
): Promise<StudioBranding> {
  const row = await env.DB.prepare(
    `SELECT id, name, brand_logo_url, brand_name, brand_tagline,
            contact_phone, contact_email, contact_address,
            watermark_enabled, watermark_text, watermark_position
     FROM workspaces WHERE id = ?1`
  )
    .bind(workspaceId)
    .first<WorkspaceBrandingRow>();

  if (!row) {
    throw new Error("WORKSPACE_NOT_FOUND");
  }

  const defaultBrandName = row.brand_name || row.name;

  return {
    workspaceId: row.id,
    brandLogoUrl: row.brand_logo_url,
    brandName: defaultBrandName,
    brandTagline: row.brand_tagline,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    contactAddress: row.contact_address,
    watermarkEnabled: row.watermark_enabled !== 0,
    watermarkText: row.watermark_text || `© ${defaultBrandName.toUpperCase()} • BẢN QUYỀN THIẾT KẾ`,
    watermarkPosition: (row.watermark_position as StudioBranding["watermarkPosition"]) || "bottom-right",
    watermarkOpacity: 0.4,
  };
}

export async function updateWorkspaceBranding(
  env: Env,
  workspaceId: string,
  actorUserId: string,
  input: UpdateBrandingInput
): Promise<StudioBranding> {
  // Enforce RBAC: Only studio owner can update brand settings
  const ws = await getWorkspace(env, workspaceId, actorUserId);
  if (ws.role !== "owner") {
    throw new Error("FORBIDDEN_PERMISSION_DENIED: Chỉ chủ sở hữu Studio mới có quyền thay đổi thông tin thương hiệu");
  }

  const current = await getWorkspaceBranding(env, workspaceId);

  const brandLogoUrl = input.brandLogoUrl !== undefined ? input.brandLogoUrl : current.brandLogoUrl;
  const brandName = input.brandName !== undefined ? input.brandName : current.brandName;
  const brandTagline = input.brandTagline !== undefined ? input.brandTagline : current.brandTagline;
  const contactPhone = input.contactPhone !== undefined ? input.contactPhone : current.contactPhone;
  const contactEmail = input.contactEmail !== undefined ? input.contactEmail : current.contactEmail;
  const contactAddress = input.contactAddress !== undefined ? input.contactAddress : current.contactAddress;
  const watermarkEnabled = input.watermarkEnabled !== undefined ? (input.watermarkEnabled ? 1 : 0) : (current.watermarkEnabled ? 1 : 0);
  const watermarkText = input.watermarkText !== undefined ? input.watermarkText : current.watermarkText;
  const watermarkPosition = input.watermarkPosition !== undefined ? input.watermarkPosition : current.watermarkPosition;

  await env.DB.prepare(
    `UPDATE workspaces
     SET brand_logo_url = ?1,
         brand_name = ?2,
         brand_tagline = ?3,
         contact_phone = ?4,
         contact_email = ?5,
         contact_address = ?6,
         watermark_enabled = ?7,
         watermark_text = ?8,
         watermark_position = ?9,
         updated_at = ?10
     WHERE id = ?11`
  )
    .bind(
      brandLogoUrl,
      brandName,
      brandTagline,
      contactPhone,
      contactEmail,
      contactAddress,
      watermarkEnabled,
      watermarkText,
      watermarkPosition,
      Date.now(),
      workspaceId
    )
    .run();

  await recordWorkspaceAuditLog(env, {
    workspaceId,
    actorId: actorUserId,
    action: "BRANDING_UPDATED",
    targetType: "branding",
    targetId: workspaceId,
    details: {
      brandName,
      watermarkEnabled: Boolean(watermarkEnabled),
      watermarkText,
    },
  });

  return {
    workspaceId,
    brandLogoUrl,
    brandName,
    brandTagline,
    contactPhone,
    contactEmail,
    contactAddress,
    watermarkEnabled: Boolean(watermarkEnabled),
    watermarkText,
    watermarkPosition: watermarkPosition as StudioBranding["watermarkPosition"],
    watermarkOpacity: input.watermarkOpacity ?? current.watermarkOpacity,
  };
}
