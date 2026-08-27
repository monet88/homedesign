"use client";

import { useCallback, useRef, useState } from "react";
import { useSession } from "@/lib/auth/session-stub";
import { CLIENT_POLL_INTERVAL_MS, CLIENT_POLL_MAX_WAIT_MS } from "@/lib/ai/types";
import type { RoomBriefProposal, RoomDesignView } from "@/lib/floor-plan/types";
import { Toast } from "@/components/design/toast";
import { Uploader } from "@/components/design/uploader";

export function FloorPlanFlow() {
  const { user } = useSession();
  const [sourceAssetId, setSourceAssetId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomDesignView | null>(null);
  const [proposal, setProposal] = useState<RoomBriefProposal | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [style, setStyle] = useState("Modern Warm");
  const [status, setStatus] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant?: "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  function showToast(message: string, variant?: "error") {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 6000);
  }

  async function ensureProject(assetId: string): Promise<string> {
    const res = await fetch("/api/floor-plan/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ sourceAssetId: assetId }),
    });
    const data = (await res.json()) as { code?: number; data?: { id: string }; error?: string };
    if (!res.ok || data.code !== 0 || !data.data?.id) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    return data.data.id;
  }

  const handleUploadReady = useCallback(async (assetId: string, file: File) => {
    setSourceAssetId(assetId);
    setPreviewUrl(URL.createObjectURL(file));
    setRoom(null);
    setProposal(null);
    setStatus(null);
    try {
      setBusy(true);
      const id = await ensureProject(assetId);
      setProjectId(id);
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }, []);

  async function placeMarker(clientX: number, clientY: number) {
    if (!projectId || !canvasRef.current || room?.markerLocked) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));

    const res = await fetch(
      room ? `/api/floor-plan/room-designs/${room.id}/marker` : "/api/floor-plan/room-designs",
      {
        method: room ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(room ? { x, y } : { projectId, x, y }),
      }
    );
    const data = (await res.json()) as { code?: number; data?: RoomDesignView; error?: string };
    if (!res.ok || data.code !== 0 || !data.data) {
      showToast(data.error ?? `HTTP ${res.status}`, "error");
      return;
    }
    setRoom(data.data);
    setProposal(null);
    setStatus(null);
  }

  async function runRecognition() {
    if (!room) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/floor-plan/room-designs/${room.id}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ style }),
      });
      const data = (await res.json()) as { code?: number; data?: RoomBriefProposal; error?: string };
      if (!res.ok || data.code !== 0 || !data.data) throw new Error(data.error ?? `HTTP ${res.status}`);
      setProposal(data.data);
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function generateBrief() {
    if (!user) {
      showToast("Sign in to generate.", "error");
      return;
    }
    if (!sourceAssetId || !room || !proposal) return;
    setBusy(true);
    setStatus("processing");
    try {
      const res = await fetch("/api/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          sourceAssetId,
          scene: "floor-plan",
          intent: {
            stage: "brief",
            marker: room.marker,
            roomId: room.id,
            style,
            recognition: proposal.recognition,
          },
          idempotencyKey: `brief-${room.id}-${Date.now()}`,
        }),
      });
      const data = (await res.json()) as { code?: number; data?: { id: string }; error?: string };
      if (!res.ok || data.code !== 0 || !data.data?.id) throw new Error(data.error ?? `HTTP ${res.status}`);

      const taskId = data.data.id;
      const start = Date.now();
      while (Date.now() - start < CLIENT_POLL_MAX_WAIT_MS) {
        await new Promise((r) => setTimeout(r, CLIENT_POLL_INTERVAL_MS));
        const poll = await fetch(`/api/designs/${taskId}`, { credentials: "same-origin" });
        const view = (await poll.json()) as {
          code?: number;
          data?: { status: string; errorCode?: string | null };
        };
        if (view.data?.status === "success") {
          setStatus("success");
          await runRecognition();
          showToast("Room Brief generated (1 Credit).");
          return;
        }
        if (view.data?.status === "failed") {
          throw new Error(view.data.errorCode ?? "TASK_FAILED");
        }
      }
      setStatus("processing");
      showToast("Still processing — you can leave and return later.");
    } catch (err) {
      setStatus("failed");
      showToast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmBrief() {
    if (!room) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/floor-plan/room-designs/${room.id}/confirm-brief`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { code?: number; data?: RoomDesignView; error?: string };
      if (!res.ok || data.code !== 0 || !data.data) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRoom(data.data);
      showToast("Room Brief confirmed — marker locked.");
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="text-center">
        <h1 className="text-3xl font-semibold text-[var(--ink,#171411)]">AI Floor Plan</h1>
        <p className="mt-2 text-neutral-600">
          Upload a floor plan, place a room marker, review recognition, and confirm your Room Brief.
        </p>
      </header>

      {!user && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Sign in with a verified account to upload and generate.
        </p>
      )}

      <Uploader
        sceneLabel="floor plan"
        disabled={!user || busy}
        onReady={handleUploadReady}
        onError={(message) => showToast(message, "error")}
      />

      {previewUrl ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Place Room Marker</h2>
          <div
            ref={canvasRef}
            className="relative cursor-crosshair overflow-hidden rounded-xl border border-neutral-200 bg-white"
            onClick={(e) => void placeMarker(e.clientX, e.clientY)}
            role="button"
            tabIndex={0}
            aria-label="Click to place room marker"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Floor plan" className="block w-full select-none" draggable={false} />
            {room ? (
              <span
                className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-rose-500 shadow"
                style={{ left: `${room.marker.x}%`, top: `${room.marker.y}%` }}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {room && !room.markerLocked ? (
        <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-6">
          <label className="text-sm font-medium" htmlFor="fp-style">
            Style
          </label>
          <input
            id="fp-style"
            className="rounded-lg border border-neutral-300 px-3 py-2"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => void runRecognition()}
            >
              Recognize room
            </button>
            <button
              type="button"
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50"
              disabled={busy || !proposal}
              onClick={() => void generateBrief()}
            >
              Generate Brief (1 Credit)
            </button>
            <button
              type="button"
              className="rounded-full border border-emerald-600 px-4 py-2 text-sm text-emerald-700 disabled:opacity-50"
              disabled={busy || (!proposal && status !== "success")}
              onClick={() => void confirmBrief()}
            >
              Confirm Brief
            </button>
          </div>
          {proposal ? (
            <div className="mt-2 rounded-lg bg-neutral-50 p-4 text-sm">
              <p className="font-medium">{proposal.recognition.roomType}</p>
              <p className="mt-1 text-neutral-600">{proposal.designProposal}</p>
              {proposal.recognition.dimensions ? (
                <p className="mt-1 text-neutral-500">
                  Readable dimensions: {proposal.recognition.dimensions.widthPx}×
                  {proposal.recognition.dimensions.heightPx}px
                </p>
              ) : (
                <p className="mt-1 text-neutral-500">No metric dimensions inferred.</p>
              )}
            </div>
          ) : null}
          {status ? <p className="text-sm text-neutral-500">Brief run: {status}</p> : null}
        </section>
      ) : null}

      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
