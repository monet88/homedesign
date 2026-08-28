// Ticket 10 — row helpers for room_designs.

import type { RoomBriefProposal, RoomDesignView } from "@/lib/floor-plan/types";

export interface RoomDesignRow {
  id: string;
  project_id: string;
  user_id: string;
  marker_id: string;
  marker_x: number;
  marker_y: number;
  marker_locked: number;
  brief_confirmed_at: number | null;
  progress: string;
  recognition_json: string | null;
  proposal_json: string | null;
  created_at: number;
  updated_at: number;
}

export function rowToView(row: RoomDesignRow): RoomDesignView {
  let proposal: RoomBriefProposal | null = null;
  if (row.proposal_json) {
    try {
      proposal = JSON.parse(row.proposal_json) as RoomBriefProposal;
    } catch {
      proposal = null;
    }
  }

  return {
    id: row.id,
    projectId: row.project_id,
    markerId: row.marker_id,
    marker: { x: row.marker_x, y: row.marker_y },
    markerLocked: Boolean(row.marker_locked),
    briefConfirmedAt: row.brief_confirmed_at,
    progress: row.progress as RoomDesignView["progress"],
    proposal,
  };
}
