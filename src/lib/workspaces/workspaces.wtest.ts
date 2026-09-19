import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import {
  createWorkspace,
  getUserWorkspaces,
  getWorkspace,
  inviteMember,
  acceptInvite,
  removeMember,
  updateMemberRole,
  allocateCreditsToWorkspace,
  deleteWorkspace,
} from "./workspaces";
import { addCredits, getAvailableCredits, getWorkspaceAvailableCredits } from "@/lib/credits/ledger";
import { createCustomPreset, listCustomPresets, deleteCustomPreset } from "@/lib/presets/custom-presets";

let ownerId: string;
let memberId: string;
let ownerEmail: string;
let memberEmail: string;

beforeEach(async () => {
  await setupDb(env.DB);
  ownerId = "owner-" + crypto.randomUUID();
  memberId = "member-" + crypto.randomUUID();
  ownerEmail = ownerId + "@example.com";
  memberEmail = memberId + "@example.com";

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?1, 'Owner User', ?2, 1, 1, 1)`
    ).bind(ownerId, ownerEmail),
    env.DB.prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?1, 'Member User', ?2, 1, 1, 1)`
    ).bind(memberId, memberEmail),
  ]);
});

describe("Workspaces & Teams Lifecycle (Ticket 8.1 & 8.2)", () => {
  it("creates workspace and sets creator as owner", async () => {
    const ws = await createWorkspace(env, ownerId, { name: "Studio Minimalist" });
    expect(ws.id).toBeDefined();
    expect(ws.name).toBe("Studio Minimalist");
    expect(ws.role).toBe("owner");
    expect(ws.memberCount).toBe(1);

    const list = await getUserWorkspaces(env, ownerId);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(ws.id);
  });

  it("invites member and accepts invite successfully", async () => {
    const ws = await createWorkspace(env, ownerId, { name: "Modern Space" });

    // Invite member
    const invite = await inviteMember(env, ws.id, ownerId, memberEmail, "architect");
    expect(invite.token).toBeDefined();
    expect(invite.email).toBe(memberEmail);
    expect(invite.role).toBe("architect");

    // Accept invite
    const accepted = await acceptInvite(env, invite.token, memberId, memberEmail);
    expect(accepted.workspaceId).toBe(ws.id);
    expect(accepted.role).toBe("architect");

    // Member can now see the workspace
    const memberWsList = await getUserWorkspaces(env, memberId);
    expect(memberWsList.length).toBe(1);
    expect(memberWsList[0].role).toBe("architect");

    const detail = await getWorkspace(env, ws.id, memberId);
    expect(detail.members.length).toBe(2);
    expect(detail.permissions.canGenerateDesigns).toBe(true);
    expect(detail.permissions.canManageMembers).toBe(false);
  });

  it("rejects accept invite if email does not match", async () => {
    const ws = await createWorkspace(env, ownerId, { name: "Secure Studio" });
    const invite = await inviteMember(env, ws.id, ownerId, "target@example.com", "viewer");

    await expect(
      acceptInvite(env, invite.token, memberId, "wrong@example.com")
    ).rejects.toThrow("EMAIL_MISMATCH");
  });

  it("updates member role and removes member", async () => {
    const ws = await createWorkspace(env, ownerId, { name: "Arch Lab" });
    const invite = await inviteMember(env, ws.id, ownerId, memberEmail, "architect");
    await acceptInvite(env, invite.token, memberId, memberEmail);

    // Change to viewer
    await updateMemberRole(env, ws.id, memberId, "viewer", ownerId);
    const detail = await getWorkspace(env, ws.id, memberId);
    expect(detail.role).toBe("viewer");
    expect(detail.permissions.canGenerateDesigns).toBe(false);

    // Remove member
    await removeMember(env, ws.id, memberId, ownerId);
    const memberList = await getUserWorkspaces(env, memberId);
    expect(memberList.length).toBe(0);
  });

  it("allocates credits from personal to workspace pool atomically", async () => {
    const ws = await createWorkspace(env, ownerId, { name: "Credit Shared Studio" });

    // Give owner 50 personal credits
    await addCredits(env, ownerId, 50, "Mock Top-Up", { entryType: "payment", idempotencyKey: "test-topup-1" });
    expect(await getAvailableCredits(env, ownerId)).toBe(50);
    expect(await getWorkspaceAvailableCredits(env, ws.id)).toBe(0);

    // Transfer 20 credits to workspace pool
    const result = await allocateCreditsToWorkspace(env, ws.id, ownerId, 20);
    expect(result.userAvailable).toBe(30);
    expect(result.workspaceAvailable).toBe(20);

    expect(await getAvailableCredits(env, ownerId)).toBe(30);
    expect(await getWorkspaceAvailableCredits(env, ws.id)).toBe(20);
  });

  it("creates, lists, and deletes custom styling presets (Ticket 8.3)", async () => {
    const ws = await createWorkspace(env, ownerId, { name: "Design Firm" });

    const preset = await createCustomPreset(env, ownerId, {
      name: "Nordic Minimalist Oak",
      description: "Signature Scandinavian Oak and Linen style",
      workspaceId: ws.id,
      scene: "interior",
      baseStyle: "Scandinavian",
      colorPalette: "Warm Neutral",
      preferredMaterials: ["Light Oak", "Washed Linen", "Matte White Metal"],
      customPromptAdditions: "Focus on pale Scandinavian daylight and uncluttered acoustic panels.",
    });

    expect(preset.id).toBeDefined();
    expect(preset.preferredMaterials).toContain("Light Oak");

    const list = await listCustomPresets(env, ownerId, ws.id, "interior");
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("Nordic Minimalist Oak");

    await deleteCustomPreset(env, preset.id, ownerId);
    const afterDelete = await listCustomPresets(env, ownerId, ws.id, "interior");
    expect(afterDelete.length).toBe(0);
  });

  it("deletes workspace by owner", async () => {
    const ws = await createWorkspace(env, ownerId, { name: "Temporary Studio" });
    await deleteWorkspace(env, ws.id, ownerId);

    const list = await getUserWorkspaces(env, ownerId);
    expect(list.length).toBe(0);
  });
});

async function setupDb(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS user (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, emailVerified INTEGER, image TEXT, createdAt INTEGER, updatedAt INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, credit_pool_enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS workspace_members (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, joined_at INTEGER NOT NULL, UNIQUE(workspace_id, user_id))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS workspace_invites (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, token TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, invited_by TEXT NOT NULL, created_at INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS custom_presets (id TEXT PRIMARY KEY, workspace_id TEXT, user_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, scene TEXT NOT NULL, room_type TEXT, base_style TEXT, color_palette TEXT, preferred_materials TEXT, custom_prompt_additions TEXT, negative_prompt_additions TEXT, thumbnail_url TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS credit_ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, entry_type TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, ref_type TEXT, ref_id TEXT, grant_key TEXT, workspace_id TEXT, created_at INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS credit_holds (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', ref_type TEXT NOT NULL, ref_id TEXT NOT NULL, ledger_hold_id TEXT, workspace_id TEXT, created_at INTEGER NOT NULL, settled_at INTEGER, released_at INTEGER)`),
  ]);
}
