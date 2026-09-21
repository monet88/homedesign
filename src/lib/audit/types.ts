// Audit Log Types & Schema (Sprint 9 - Ticket 9.1)

export type AuditAction =
  | "CREDIT_ALLOCATED"
  | "RENDER_TRIGGERED"
  | "RENDER_COMPLETED"
  | "RENDER_REFUNDED"
  | "MEMBER_INVITED"
  | "MEMBER_JOINED"
  | "MEMBER_ROLE_CHANGED"
  | "MEMBER_REMOVED"
  | "PROJECT_CREATED"
  | "PROJECT_DELETED"
  | "PRESET_CREATED"
  | "PRESET_DELETED"
  | "BRANDING_UPDATED";

export type AuditTargetType =
  | "credit"
  | "task"
  | "member"
  | "project"
  | "preset"
  | "branding";

export interface WorkspaceAuditLog {
  id: string;
  workspaceId: string;
  actorId: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: number;
  actorName?: string;
  actorEmail?: string;
  actorImage?: string | null;
}

export interface RecordAuditLogParams {
  workspaceId: string;
  actorId: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
}

export interface ListAuditLogsOptions {
  limit?: number;
  cursor?: number; // timestamp cursor for keyset pagination
  action?: AuditAction;
  actorId?: string;
}
