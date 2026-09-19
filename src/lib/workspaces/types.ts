// Workspace, Member & Permission Types (Ticket 8.1 & 8.2)

export type WorkspaceRole = "owner" | "architect" | "viewer";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  creditPoolEnabled: boolean;
  createdAt: number;
  updatedAt: number;
  role?: WorkspaceRole;
  memberCount?: number;
  availableCredits?: number;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: number;
  name?: string;
  email?: string;
  image?: string | null;
}

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  email: string;
  role: "architect" | "viewer";
  token: string;
  expiresAt: number;
  invitedBy: string;
  createdAt: number;
  inviterName?: string;
  workspaceName?: string;
}

export interface WorkspacePermissions {
  canManageSettings: boolean;
  canManageMembers: boolean;
  canAllocateCredits: boolean;
  canGenerateDesigns: boolean;
  canCreatePresets: boolean;
  canDeleteWorkspace: boolean;
}

export function getWorkspacePermissions(role?: WorkspaceRole): WorkspacePermissions {
  if (role === "owner") {
    return {
      canManageSettings: true,
      canManageMembers: true,
      canAllocateCredits: true,
      canGenerateDesigns: true,
      canCreatePresets: true,
      canDeleteWorkspace: true,
    };
  }
  if (role === "architect") {
    return {
      canManageSettings: false,
      canManageMembers: false,
      canAllocateCredits: false,
      canGenerateDesigns: true,
      canCreatePresets: true,
      canDeleteWorkspace: false,
    };
  }
  // viewer
  return {
    canManageSettings: false,
    canManageMembers: false,
    canAllocateCredits: false,
    canGenerateDesigns: false,
    canCreatePresets: false,
    canDeleteWorkspace: false,
  };
}
