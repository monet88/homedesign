import { describe, expect, it } from "vitest";
import { getWorkspacePermissions, type WorkspaceRole } from "./types";

describe("Workspace Permissions (Ticket 8.2)", () => {
  it("grants full permissions to owner", () => {
    const p = getWorkspacePermissions("owner");
    expect(p.canManageSettings).toBe(true);
    expect(p.canManageMembers).toBe(true);
    expect(p.canAllocateCredits).toBe(true);
    expect(p.canGenerateDesigns).toBe(true);
    expect(p.canCreatePresets).toBe(true);
    expect(p.canDeleteWorkspace).toBe(true);
  });

  it("grants design and preset permissions to architect/editor but no member/billing/delete management", () => {
    const p = getWorkspacePermissions("architect");
    expect(p.canManageSettings).toBe(false);
    expect(p.canManageMembers).toBe(false);
    expect(p.canAllocateCredits).toBe(false);
    expect(p.canGenerateDesigns).toBe(true);
    expect(p.canCreatePresets).toBe(true);
    expect(p.canDeleteWorkspace).toBe(false);
  });

  it("restricts viewer to read-only without design creation or credit consumption", () => {
    const p = getWorkspacePermissions("viewer");
    expect(p.canManageSettings).toBe(false);
    expect(p.canManageMembers).toBe(false);
    expect(p.canAllocateCredits).toBe(false);
    expect(p.canGenerateDesigns).toBe(false);
    expect(p.canCreatePresets).toBe(false);
    expect(p.canDeleteWorkspace).toBe(false);
  });

  it("falls back to viewer permissions for undefined or unknown roles", () => {
    const p = getWorkspacePermissions(undefined);
    expect(p.canGenerateDesigns).toBe(false);
    expect(p.canManageMembers).toBe(false);
  });
});
