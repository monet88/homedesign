// Workspace and Team Management Service (Ticket 8.1 & 8.2)

import type { Env } from "@/lib/bindings";
import {
  type Workspace,
  type WorkspaceInvite,
  type WorkspaceMember,
  type WorkspaceRole,
  getWorkspacePermissions,
} from "./types";
import { getAvailableCredits, getWorkspaceAvailableCredits } from "@/lib/credits/ledger";
import { recordWorkspaceAuditLog } from "@/lib/audit/audit-logger";

function uid(): string {
  return crypto.randomUUID();
}

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "studio";
}

export async function createWorkspace(
  env: Env,
  ownerId: string,
  input: { name: string; slug?: string }
): Promise<Workspace> {
  const name = input.name.trim();
  if (!name) throw new Error("WORKSPACE_NAME_REQUIRED");

  const id = uid();
  const now = Date.now();
  const baseSlug = input.slug?.trim() ? slugify(input.slug) : slugify(name);
  const slug = `${baseSlug}-${id.slice(0, 6)}`;

  const memberId = uid();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO workspaces (id, name, slug, owner_id, credit_pool_enabled, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)`
    ).bind(id, name, slug, ownerId, now, now),
    env.DB.prepare(
      `INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at)
       VALUES (?1, ?2, ?3, 'owner', ?4)`
    ).bind(memberId, id, ownerId, now),
  ]);

  return {
    id,
    name,
    slug,
    ownerId,
    creditPoolEnabled: true,
    createdAt: now,
    updatedAt: now,
    role: "owner",
    memberCount: 1,
    availableCredits: 0,
  };
}

export async function getUserWorkspaces(
  env: Env,
  userId: string
): Promise<Workspace[]> {
  const result = await env.DB.prepare(
    `SELECT w.id, w.name, w.slug, w.owner_id, w.credit_pool_enabled, w.created_at, w.updated_at,
            wm.role,
            (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id) AS memberCount
     FROM workspaces w
     INNER JOIN workspace_members wm ON w.id = wm.workspace_id
     WHERE wm.user_id = ?1
     ORDER BY wm.joined_at ASC`
  ).bind(userId).all<{
    id: string;
    name: string;
    slug: string;
    owner_id: string;
    credit_pool_enabled: number;
    created_at: number;
    updated_at: number;
    role: string;
    memberCount: number;
  }>();

  const rows = result.results ?? [];
  const workspaces: Workspace[] = [];

  for (const row of rows) {
    const credits = await getWorkspaceAvailableCredits(env, row.id);
    workspaces.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      ownerId: row.owner_id,
      creditPoolEnabled: Boolean(row.credit_pool_enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      role: row.role as WorkspaceRole,
      memberCount: row.memberCount,
      availableCredits: credits,
    });
  }

  return workspaces;
}

export async function getWorkspace(
  env: Env,
  workspaceId: string,
  userId: string
): Promise<
  Workspace & {
    role: WorkspaceRole;
    permissions: ReturnType<typeof getWorkspacePermissions>;
    members: WorkspaceMember[];
    invites: WorkspaceInvite[];
  }
> {
  const memberRow = await env.DB.prepare(
    `SELECT wm.role, w.id, w.name, w.slug, w.owner_id, w.credit_pool_enabled, w.created_at, w.updated_at
     FROM workspaces w
     INNER JOIN workspace_members wm ON w.id = wm.workspace_id
     WHERE w.id = ?1 AND wm.user_id = ?2`
  ).bind(workspaceId, userId).first<{
    role: string;
    id: string;
    name: string;
    slug: string;
    owner_id: string;
    credit_pool_enabled: number;
    created_at: number;
    updated_at: number;
  }>();

  if (!memberRow) {
    throw new Error("WORKSPACE_NOT_FOUND_OR_ACCESS_DENIED");
  }

  const role = memberRow.role as WorkspaceRole;
  const permissions = getWorkspacePermissions(role);

  // Fetch members
  const membersResult = await env.DB.prepare(
    `SELECT wm.id, wm.workspace_id, wm.user_id, wm.role, wm.joined_at,
            u.name, u.email, u.image
     FROM workspace_members wm
     LEFT JOIN user u ON wm.user_id = u.id
     WHERE wm.workspace_id = ?1
     ORDER BY CASE wm.role WHEN 'owner' THEN 1 WHEN 'architect' THEN 2 ELSE 3 END, wm.joined_at ASC`
  ).bind(workspaceId).all<{
    id: string;
    workspace_id: string;
    user_id: string;
    role: string;
    joined_at: number;
    name: string | null;
    email: string | null;
    image: string | null;
  }>();

  const members: WorkspaceMember[] = (membersResult.results ?? []).map((m) => ({
    id: m.id,
    workspaceId: m.workspace_id,
    userId: m.user_id,
    role: m.role as WorkspaceRole,
    joinedAt: m.joined_at,
    name: m.name ?? undefined,
    email: m.email ?? undefined,
    image: m.image ?? undefined,
  }));

  // Fetch pending invites (only owners can see invites)
  let invites: WorkspaceInvite[] = [];
  if (permissions.canManageMembers) {
    const invitesResult = await env.DB.prepare(
      `SELECT wi.id, wi.workspace_id, wi.email, wi.role, wi.token, wi.expires_at, wi.invited_by, wi.created_at,
              u.name as inviterName
       FROM workspace_invites wi
       LEFT JOIN user u ON wi.invited_by = u.id
       WHERE wi.workspace_id = ?1 AND wi.expires_at > ?2
       ORDER BY wi.created_at DESC`
    ).bind(workspaceId, Date.now()).all<{
      id: string;
      workspace_id: string;
      email: string;
      role: string;
      token: string;
      expires_at: number;
      invited_by: string;
      created_at: number;
      inviterName: string | null;
    }>();

    invites = (invitesResult.results ?? []).map((i) => ({
      id: i.id,
      workspaceId: i.workspace_id,
      email: i.email,
      role: i.role as "architect" | "viewer",
      token: i.token,
      expiresAt: i.expires_at,
      invitedBy: i.invited_by,
      createdAt: i.created_at,
      inviterName: i.inviterName ?? undefined,
      workspaceName: memberRow.name,
    }));
  }

  const credits = await getWorkspaceAvailableCredits(env, workspaceId);

  return {
    id: memberRow.id,
    name: memberRow.name,
    slug: memberRow.slug,
    ownerId: memberRow.owner_id,
    creditPoolEnabled: Boolean(memberRow.credit_pool_enabled),
    createdAt: memberRow.created_at,
    updatedAt: memberRow.updated_at,
    role,
    permissions,
    memberCount: members.length,
    availableCredits: credits,
    members,
    invites,
  };
}

export async function inviteMember(
  env: Env,
  workspaceId: string,
  inviterUserId: string,
  email: string,
  role: "architect" | "viewer"
): Promise<WorkspaceInvite> {
  const normEmail = email.toLowerCase().trim();
  if (!normEmail || !normEmail.includes("@")) throw new Error("INVALID_EMAIL");

  // Check inviter permissions
  const ws = await getWorkspace(env, workspaceId, inviterUserId);
  if (!ws.permissions.canManageMembers) {
    throw new Error("FORBIDDEN_PERMISSION_DENIED");
  }

  // Check if target is already a member
  const existingMember = await env.DB.prepare(
    `SELECT wm.id FROM workspace_members wm
     INNER JOIN user u ON wm.user_id = u.id
     WHERE wm.workspace_id = ?1 AND LOWER(u.email) = ?2`
  ).bind(workspaceId, normEmail).first();

  if (existingMember) {
    throw new Error("USER_ALREADY_MEMBER");
  }

  const id = uid();
  const token = uid().replace(/-/g, "");
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

  // Delete any existing invite for this email in this workspace
  await env.DB.prepare(
    `DELETE FROM workspace_invites WHERE workspace_id = ?1 AND LOWER(email) = ?2`
  ).bind(workspaceId, normEmail).run();

  await env.DB.prepare(
    `INSERT INTO workspace_invites (id, workspace_id, email, role, token, expires_at, invited_by, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  ).bind(id, workspaceId, normEmail, role, token, expiresAt, inviterUserId, now).run();

  await recordWorkspaceAuditLog(env, {
    workspaceId,
    actorId: inviterUserId,
    action: "MEMBER_INVITED",
    targetType: "member",
    targetId: id,
    details: { email: normEmail, role },
  });

  return {
    id,
    workspaceId,
    email: normEmail,
    role,
    token,
    expiresAt,
    invitedBy: inviterUserId,
    createdAt: now,
    workspaceName: ws.name,
  };
}

export async function getInviteByToken(
  env: Env,
  token: string
): Promise<WorkspaceInvite & { workspaceName: string; inviterName?: string }> {
  const invite = await env.DB.prepare(
    `SELECT wi.id, wi.workspace_id, wi.email, wi.role, wi.token, wi.expires_at, wi.invited_by, wi.created_at,
            w.name as workspaceName, u.name as inviterName
     FROM workspace_invites wi
     INNER JOIN workspaces w ON wi.workspace_id = w.id
     LEFT JOIN user u ON wi.invited_by = u.id
     WHERE wi.token = ?1`
  ).bind(token).first<{
    id: string;
    workspace_id: string;
    email: string;
    role: string;
    token: string;
    expires_at: number;
    invited_by: string;
    created_at: number;
    workspaceName: string;
    inviterName: string | null;
  }>();

  if (!invite) throw new Error("INVITE_NOT_FOUND");
  if (invite.expires_at < Date.now()) throw new Error("INVITE_EXPIRED");

  return {
    id: invite.id,
    workspaceId: invite.workspace_id,
    email: invite.email,
    role: invite.role as "architect" | "viewer",
    token: invite.token,
    expiresAt: invite.expires_at,
    invitedBy: invite.invited_by,
    createdAt: invite.created_at,
    workspaceName: invite.workspaceName,
    inviterName: invite.inviterName ?? undefined,
  };
}

export async function acceptInvite(
  env: Env,
  token: string,
  userId: string,
  userEmail: string
): Promise<{ workspaceId: string; role: WorkspaceRole }> {
  const invite = await getInviteByToken(env, token);

  const normUserEmail = userEmail.toLowerCase().trim();
  const normInviteEmail = invite.email.toLowerCase().trim();

  // Guard against mismatched email
  if (normUserEmail !== normInviteEmail) {
    throw new Error("EMAIL_MISMATCH");
  }

  const memberId = uid();
  const now = Date.now();

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      ).bind(memberId, invite.workspaceId, userId, invite.role, now),
      env.DB.prepare(`DELETE FROM workspace_invites WHERE id = ?1`).bind(invite.id),
    ]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("UNIQUE constraint failed")) {
      // Already a member, just cleanup invite
      await env.DB.prepare(`DELETE FROM workspace_invites WHERE id = ?1`).bind(invite.id).run();
      return { workspaceId: invite.workspaceId, role: invite.role };
    }
    throw err;
  }

  await recordWorkspaceAuditLog(env, {
    workspaceId: invite.workspaceId,
    actorId: userId,
    action: "MEMBER_JOINED",
    targetType: "member",
    targetId: memberId,
    details: { role: invite.role, email: userEmail },
  });

  return { workspaceId: invite.workspaceId, role: invite.role };
}

export async function removeMember(
  env: Env,
  workspaceId: string,
  targetUserId: string,
  callerUserId: string
): Promise<void> {
  const ws = await getWorkspace(env, workspaceId, callerUserId);
  if (!ws.permissions.canManageMembers) {
    throw new Error("FORBIDDEN_PERMISSION_DENIED");
  }

  if (targetUserId === ws.ownerId) {
    throw new Error("CANNOT_REMOVE_OWNER");
  }

  await env.DB.prepare(
    `DELETE FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2`
  ).bind(workspaceId, targetUserId).run();

  await recordWorkspaceAuditLog(env, {
    workspaceId,
    actorId: callerUserId,
    action: "MEMBER_REMOVED",
    targetType: "member",
    targetId: targetUserId,
  });
}

export async function updateMemberRole(
  env: Env,
  workspaceId: string,
  targetUserId: string,
  newRole: "architect" | "viewer",
  callerUserId: string
): Promise<void> {
  const ws = await getWorkspace(env, workspaceId, callerUserId);
  if (!ws.permissions.canManageMembers) {
    throw new Error("FORBIDDEN_PERMISSION_DENIED");
  }

  if (targetUserId === ws.ownerId) {
    throw new Error("CANNOT_CHANGE_OWNER_ROLE");
  }

  await env.DB.prepare(
    `UPDATE workspace_members SET role = ?1 WHERE workspace_id = ?2 AND user_id = ?3`
  ).bind(newRole, workspaceId, targetUserId).run();

  await recordWorkspaceAuditLog(env, {
    workspaceId,
    actorId: callerUserId,
    action: "MEMBER_ROLE_CHANGED",
    targetType: "member",
    targetId: targetUserId,
    details: { newRole },
  });
}

export async function allocateCreditsToWorkspace(
  env: Env,
  workspaceId: string,
  ownerUserId: string,
  amount: number
): Promise<{ userAvailable: number; workspaceAvailable: number }> {
  if (amount <= 0 || !Number.isInteger(amount)) {
    throw new Error("INVALID_AMOUNT");
  }

  const ws = await getWorkspace(env, workspaceId, ownerUserId);
  if (!ws.permissions.canAllocateCredits) {
    throw new Error("FORBIDDEN_PERMISSION_DENIED");
  }

  const userCredits = await getAvailableCredits(env, ownerUserId);
  if (userCredits < amount) {
    throw new Error("INSUFFICIENT_PERSONAL_CREDITS");
  }

  const deductId = uid();
  const grantId = uid();
  const now = Date.now();

  await env.DB.batch([
    // Deduct from owner personal balance
    env.DB.prepare(
      `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, workspace_id, created_at)
       VALUES (?1, ?2, 'usage', ?3, ?4, 'workspace', ?5, NULL, ?6)`
    ).bind(
      deductId,
      ownerUserId,
      amount,
      `Allocated to workspace: ${ws.name}`,
      workspaceId,
      now
    ),
    // Deposit to workspace shared pool
    env.DB.prepare(
      `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, workspace_id, created_at)
       VALUES (?1, ?2, 'grant', ?3, ?4, 'user', ?5, ?6, ?7)`
    ).bind(
      grantId,
      ownerUserId,
      amount,
      `Deposit from workspace owner`,
      ownerUserId,
      workspaceId,
      now
    ),
  ]);

  const [newUserAvail, newWsAvail] = await Promise.all([
    getAvailableCredits(env, ownerUserId),
    getWorkspaceAvailableCredits(env, workspaceId),
  ]);

  await recordWorkspaceAuditLog(env, {
    workspaceId,
    actorId: ownerUserId,
    action: "CREDIT_ALLOCATED",
    targetType: "credit",
    targetId: grantId,
    details: {
      amount,
      newWorkspaceAvailable: newWsAvail,
    },
  });

  return {
    userAvailable: newUserAvail,
    workspaceAvailable: newWsAvail,
  };
}

export async function deleteWorkspace(
  env: Env,
  workspaceId: string,
  callerUserId: string
): Promise<void> {
  const ws = await getWorkspace(env, workspaceId, callerUserId);
  if (!ws.permissions.canDeleteWorkspace) {
    throw new Error("FORBIDDEN_PERMISSION_DENIED");
  }

  await env.DB.prepare(`DELETE FROM workspaces WHERE id = ?1 AND owner_id = ?2`)
    .bind(workspaceId, callerUserId)
    .run();
}
