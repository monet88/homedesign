"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Workspace } from "@/lib/workspaces/types";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  loading: boolean;
  setActiveWorkspaceId: (id: string | null) => void;
  refreshWorkspaces: () => Promise<void>;
  createWorkspaceModalOpen: boolean;
  setCreateWorkspaceModalOpen: (open: boolean) => void;
  settingsModalOpen: boolean;
  setSettingsModalOpen: (open: boolean) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

const STORAGE_KEY = "hd_active_workspace_id";

import { CreateWorkspaceModal } from "./create-workspace-modal";
import { WorkspaceSettingsModal } from "./workspace-settings-modal";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createWorkspaceModalOpen, setCreateWorkspaceModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces");
      if (!res.ok) return;
      const json = (await res.json()) as any;
      if (json.code === 0 && Array.isArray(json.data?.workspaces)) {
        setWorkspaces(json.data.workspaces);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWorkspaces();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setActiveWorkspaceIdState(saved);
    } catch {
      // ignore
    }
  }, [refreshWorkspaces]);

  const setActiveWorkspaceId = useCallback((id: string | null) => {
    setActiveWorkspaceIdState(id);
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEY, id);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        loading,
        setActiveWorkspaceId,
        refreshWorkspaces,
        createWorkspaceModalOpen,
        setCreateWorkspaceModalOpen,
        settingsModalOpen,
        setSettingsModalOpen,
      }}
    >
      {children}
      <CreateWorkspaceModal />
      <WorkspaceSettingsModal />
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}
