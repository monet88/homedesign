"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FLOOR_PLAN_STAGE_COST, CLIENT_POLL_INTERVAL_MS, CLIENT_POLL_MAX_WAIT_MS } from "@/lib/ai/types";
import {
  EMAIL_VERIFY_MESSAGE,
  isEmailNotVerifiedError,
  isInsufficientCreditsError,
} from "@/lib/auth/verify-message";
import { useSession } from "@/lib/auth/session-stub";
import type {
  FloorPlanProjectDetailView,
  RoomBriefProposal,
  RoomDesignDetailView,
  RoomDesignView,
  StageRunView,
} from "@/lib/floor-plan/types";
import { Toast } from "@/components/design/toast";
import { Uploader } from "@/components/design/uploader";
import { MockPaymentModal } from "@/components/payments/mock-payment-modal";
import { PanoramaViewer } from "@/components/floor-plan/panorama-viewer";

type StageKind = "brief" | "layout" | "render" | "panorama";

function activeRunId(runs: StageRunView[], stage: StageRunView["stage"]): string | null {
  const confirmed = runs
    .filter((r) => r.stage === stage && r.status === "confirmed")
    .sort((a, b) => (b.confirmedAt ?? 0) - (a.confirmedAt ?? 0));
  return confirmed[0]?.id ?? null;
}

export function FloorPlanFlow() {
  const { user } = useSession();
  const searchParams = useSearchParams();
  const resumeProjectId = searchParams.get("project");

  const [sourceAssetId, setSourceAssetId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectDetail, setProjectDetail] = useState<FloorPlanProjectDetailView | null>(null);
  const [room, setRoom] = useState<RoomDesignView | null>(null);
  const [proposal, setProposal] = useState<RoomBriefProposal | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [projectBootstrapFailed, setProjectBootstrapFailed] = useState(false);
  const [style, setStyle] = useState("Modern Warm");
  const [status, setStatus] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant?: "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [addingNextRoom, setAddingNextRoom] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const resumeLoaded = useRef(false);

  function showToast(message: string, variant?: "error") {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 6000);
  }

  const applyRoom = useCallback((next: RoomDesignView, detailRoom?: RoomDesignDetailView) => {
    setRoom(next);
    setProposal(next.proposal);
    if (detailRoom) {
      setProjectDetail((prev) =>
        prev
          ? {
              ...prev,
              rooms: prev.rooms.map((r) => (r.id === detailRoom.id ? { ...detailRoom, ...next } : r)),
            }
          : prev
      );
    }
  }, []);

  async function fetchProjectDetail(id: string): Promise<FloorPlanProjectDetailView> {
    const res = await fetch(`/api/floor-plan/projects/${id}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const data = (await res.json()) as {
      code?: number;
      data?: FloorPlanProjectDetailView;
      error?: string;
    };
    if (!res.ok || data.code !== 0 || !data.data) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    return data.data;
  }

  async function refreshProject(id: string) {
    const detail = await fetchProjectDetail(id);
    setProjectDetail(detail);
    setProjectId(detail.id);
    setSourceAssetId(detail.sourceAssetId);
    setPreviewUrl(`/api/assets/${detail.sourceAssetId}/download`);

    const current =
      detail.rooms.find((r) => r.id === detail.overview.currentRoomId) ?? detail.rooms[0] ?? null;
    if (current) {
      applyRoom(current, current);
    }
    return detail;
  }

  async function pollTask(taskId: string, label: string): Promise<boolean> {
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
        showToast(`${label} generated.`);
        return true;
      }
      if (view.data?.status === "failed") {
        throw new Error(view.data.errorCode ?? "TASK_FAILED");
      }
    }
    setStatus("processing");
    showToast("Still processing — you can leave and return later.");
    return false;
  }

  async function resumeProcessingTasks(detail: FloorPlanProjectDetailView) {
    for (const task of detail.processingTasks) {
      setStatus("processing");
      const label =
        task.stage === "layout"
          ? "Room Layout"
          : task.stage === "render"
            ? "Room Render"
            : task.stage === "panorama"
              ? "Room Panorama"
              : "Room Brief";
      try {
        await pollTask(task.designId, label);
      } catch (err) {
        showToast((err as Error).message, "error");
      }
    }
    if (detail.processingTasks.length > 0 && projectId) {
      await refreshProject(projectId);
    }
  }

  useEffect(() => {
    if (!user || !resumeProjectId || resumeLoaded.current) return;
    resumeLoaded.current = true;
    void (async () => {
      setBusy(true);
      try {
        const detail = await refreshProject(resumeProjectId);
        await resumeProcessingTasks(detail);
      } catch (err) {
        showToast((err as Error).message, "error");
      } finally {
        setBusy(false);
      }
    })();
  }, [user, resumeProjectId]);

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

  const handleUploadReady = useCallback(async (assetId: string, file: File, uploadedPreviewUrl: string) => {
    setSourceAssetId(assetId);
    setRoom(null);
    setProposal(null);
    setProjectDetail(null);
    setProjectId(null);
    setProjectBootstrapFailed(false);
    setStatus(null);
    setAddingNextRoom(false);
    setPreviewUrl(uploadedPreviewUrl || URL.createObjectURL(file));
    try {
      setBusy(true);
      const id = await ensureProject(assetId);
      setProjectId(id);
      await refreshProject(id);
    } catch (err) {
      setProjectId(null);
      setProjectBootstrapFailed(true);
      showToast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }, []);

  async function placeMarker(clientX: number, clientY: number) {
    if (busy || projectBootstrapFailed || !projectId || !canvasRef.current) return;
    if (room?.markerLocked && !addingNextRoom) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));

    let url: string;
    let method: string;
    let body: object;

    if (addingNextRoom) {
      url = `/api/floor-plan/projects/${projectId}/next-room`;
      method = "POST";
      body = { x, y };
    } else if (room) {
      url = `/api/floor-plan/room-designs/${room.id}/marker`;
      method = "PATCH";
      body = { x, y };
    } else {
      url = "/api/floor-plan/room-designs";
      method = "POST";
      body = { projectId, x, y };
    }

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { code?: number; data?: RoomDesignView; error?: string };
    if (!res.ok || data.code !== 0 || !data.data) {
      showToast(data.error ?? `HTTP ${res.status}`, "error");
      return;
    }
    setAddingNextRoom(false);
    applyRoom(data.data);
    setStatus(null);
    if (projectId) await refreshProject(projectId);
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

  async function generateStage(stage: StageKind) {
    if (!user) {
      showToast("Sign in to generate.", "error");
      return;
    }
    if (user.emailVerified === false) {
      showToast(EMAIL_VERIFY_MESSAGE, "error");
      return;
    }
    if (!sourceAssetId || !room) return;
    if (stage === "brief" && !proposal) return;

    const cost = FLOOR_PLAN_STAGE_COST[stage];
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
            stage,
            marker: room.marker,
            roomId: room.id,
            style,
            ...(stage === "brief" && proposal ? { recognition: proposal.recognition } : {}),
          },
          idempotencyKey: `${stage}-${room.id}-${Date.now()}`,
        }),
      });
      const data = (await res.json()) as {
        code?: number;
        data?: { id: string };
        error?: string;
        reason?: string;
      };
      if (!res.ok || data.code !== 0 || !data.data?.id) {
        if (isInsufficientCreditsError(res.status, data.error)) {
          setPaymentMessage(data.reason ?? "You need more Credits for this stage.");
          setPaymentOpen(true);
          return;
        }
        if (isEmailNotVerifiedError(res.status, data.error)) {
          showToast(EMAIL_VERIFY_MESSAGE, "error");
          return;
        }
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const labels = {
        brief: "Room Brief",
        layout: "Room Layout",
        render: "Room Render",
        panorama: "Room Panorama",
      };
      await pollTask(data.data.id, labels[stage]);
      if (stage === "brief") await runRecognition();
      if (projectId) await refreshProject(projectId);
      showToast(`${labels[stage]} generated (${cost} Credit${cost > 1 ? "s" : ""}).`);
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
      applyRoom(data.data);
      if (projectId) await refreshProject(projectId);
      showToast("Room Brief confirmed: marker locked.");
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmStage(stage: "layout" | "render", designId?: string) {
    if (!room) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/floor-plan/room-designs/${room.id}/confirm-${stage}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(designId ? { designId } : {}),
      });
      const data = (await res.json()) as { code?: number; data?: RoomDesignView; error?: string };
      if (!res.ok || data.code !== 0 || !data.data) throw new Error(data.error ?? `HTTP ${res.status}`);
      applyRoom(data.data);
      if (projectId) await refreshProject(projectId);
      showToast(`Room ${stage === "layout" ? "Layout" : "Render"} confirmed.`);
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function restoreRun(stageRunId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/floor-plan/stage-runs/${stageRunId}/restore`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { code?: number; data?: RoomDesignView; error?: string };
      if (!res.ok || data.code !== 0 || !data.data) throw new Error(data.error ?? `HTTP ${res.status}`);
      applyRoom(data.data);
      if (projectId) await refreshProject(projectId);
      showToast("Restored as current lineage.");
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function selectRoom(roomId: string) {
    const detailRoom = projectDetail?.rooms.find((r) => r.id === roomId);
    if (detailRoom) {
      applyRoom(detailRoom, detailRoom);
      setAddingNextRoom(false);
    }
  }

  const currentRoomDetail = projectDetail?.rooms.find((r) => r.id === room?.id);
  const overview = projectDetail?.overview;
  const canAddNextRoom = Boolean(
    projectDetail && overview && overview.completeRooms > 0 && overview.currentRoomId === null
  );
  const renderConfirmed = currentRoomDetail?.stageRuns.some(
    (r) => r.stage === "render" && r.status === "confirmed"
  );
  const panoramaRun = currentRoomDetail?.stageRuns.find(
    (r) => r.stage === "panorama" && r.status === "success" && r.outputAssetId
  );
  const canGeneratePanorama =
    Boolean(renderConfirmed) &&
    !currentRoomDetail?.stageRuns.some((r) => r.stage === "panorama" && r.status === "processing");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="text-center">
        <h1 className="text-3xl font-semibold text-[var(--ink,#171411)]">AI Floor Plan</h1>
        <p className="mt-2 text-neutral-600">
          Upload a floor plan, place room markers, and design each room through brief, layout, and render.
        </p>
      </header>

      {!user && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Sign in with a verified account to upload and generate.
        </p>
      )}

      {overview ? (
        <section
          className="rounded-xl border border-neutral-200 bg-white p-6"
          aria-label="Project Overview"
        >
          <h2 className="text-lg font-medium">Project Overview</h2>
          <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-neutral-500">Marked areas</dt>
              <dd className="text-xl font-semibold">{overview.markedAreas}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Complete rooms</dt>
              <dd className="text-xl font-semibold">{overview.completeRooms}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Current room</dt>
              <dd className="font-medium">
                {overview.currentRoomId
                  ? projectDetail?.rooms.find((r) => r.id === overview.currentRoomId)?.proposal
                      ?.recognition.roomType ?? "In progress"
                  : canAddNextRoom
                    ? "Add next room"
                    : "-"}
              </dd>
            </div>
          </dl>
          {projectDetail && projectDetail.rooms.length > 1 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {projectDetail.rooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs ${
                    r.id === room?.id
                      ? "bg-neutral-900 text-white"
                      : "border border-neutral-300 text-neutral-700"
                  }`}
                  onClick={() => selectRoom(r.id)}
                >
                  {r.proposal?.recognition.roomType ?? "Room"} ({Math.round(r.marker.x)},{Math.round(r.marker.y)})
                  {r.complete ? " ✓" : ""}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <Uploader
        scene="floor-plan"
        sceneLabel="floor plan"
        disabled={!user || busy}
        onReady={(assetId, file, uploadedPreviewUrl) =>
          void handleUploadReady(assetId, file, uploadedPreviewUrl)
        }
        onError={(message) => showToast(message, "error")}
      />

      {previewUrl ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">
              {addingNextRoom ? "Add Next Room: place marker" : "Place Room Marker"}
            </h2>
            {canAddNextRoom && !addingNextRoom ? (
              <button
                type="button"
                className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm"
                onClick={() => setAddingNextRoom(true)}
              >
                Add Next Room
              </button>
            ) : null}
          </div>
          <div
            ref={canvasRef}
            className="relative cursor-crosshair overflow-hidden rounded-xl border border-neutral-200 bg-white"
            onClick={(e) => void placeMarker(e.clientX, e.clientY)}
            role="button"
            tabIndex={0}
            aria-label="Click to place room marker"
            aria-disabled={busy || projectBootstrapFailed || !projectId ? "true" : "false"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Floor plan" className="block w-full select-none" draggable={false} />
            {projectDetail?.rooms.map((r) => (
              <button
                key={r.markerId}
                type="button"
                className={`absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow transition-transform hover:scale-125 focus:outline-hidden cursor-pointer z-10 ${
                  r.id === room?.id ? "bg-rose-500 ring-2 ring-rose-500/40" : r.complete ? "bg-emerald-500" : "bg-amber-400"
                }`}
                style={{ left: `${r.marker.x}%`, top: `${r.marker.y}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  selectRoom(r.id);
                }}
                aria-label={`Select ${r.proposal?.recognition.roomType ?? "Room"} marker`}
              />
            ))}
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
              onClick={() => void generateStage("brief")}
            >
              Generate Brief ({FLOOR_PLAN_STAGE_COST.brief} Credit)
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
            </div>
          ) : null}
          {status ? <p className="text-sm text-neutral-500">Brief run: {status}</p> : null}
        </section>
      ) : null}

      {room?.markerLocked && currentRoomDetail && !currentRoomDetail.complete ? (
        <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium">Layout &amp; Render</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50"
              disabled={busy}
              onClick={() => void generateStage("layout")}
            >
              Generate Layout ({FLOOR_PLAN_STAGE_COST.layout} Credits)
            </button>
            <button
              type="button"
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50"
              disabled={busy || !currentRoomDetail.stageRuns.some((r) => r.stage === "layout" && r.status === "success")}
              onClick={() => {
                const run = currentRoomDetail.stageRuns.find(
                  (r) => r.stage === "layout" && r.status === "success"
                );
                void confirmStage("layout", run?.designId ?? undefined);
              }}
            >
              Confirm Layout
            </button>
            <button
              type="button"
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50"
              disabled={busy || !currentRoomDetail.stageRuns.some((r) => r.stage === "layout" && r.status === "confirmed")}
              onClick={() => void generateStage("render")}
            >
              Generate Render ({FLOOR_PLAN_STAGE_COST.render} Credits)
            </button>
            <button
              type="button"
              className="rounded-full border border-emerald-600 px-4 py-2 text-sm text-emerald-700 disabled:opacity-50"
              disabled={busy || !currentRoomDetail.stageRuns.some((r) => r.stage === "render" && r.status === "success")}
              onClick={() => {
                const run = currentRoomDetail.stageRuns.find(
                  (r) => r.stage === "render" && r.status === "success"
                );
                void confirmStage("render", run?.designId ?? undefined);
              }}
            >
              Confirm Render
            </button>
          </div>
          {status ? <p className="text-sm text-neutral-500">Run: {status}</p> : null}
        </section>
      ) : null}

      {renderConfirmed ? (
        <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium">Room Panorama (optional)</h2>
          <p className="text-sm text-neutral-600">
            Generate a 360° panorama ({FLOOR_PLAN_STAGE_COST.panorama} Credits) or skip — the room is already complete after
            confirming the render.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50"
              disabled={busy || !canGeneratePanorama}
              onClick={() => void generateStage("panorama")}
            >
              Generate Panorama ({FLOOR_PLAN_STAGE_COST.panorama} Credits)
            </button>
            <button
              type="button"
              className="rounded-full border border-emerald-600 px-4 py-2 text-sm text-emerald-700 disabled:opacity-50"
              disabled={busy}
              onClick={() => showToast("Panorama skipped — room complete.")}
            >
              Skip Panorama
            </button>
          </div>
          {panoramaRun?.outputAssetId ? (
            <PanoramaViewer
              assetId={panoramaRun.outputAssetId}
              orientation={panoramaRun.panoramaOrientation}
              alt="Room panorama"
            />
          ) : null}
          {status ? <p className="text-sm text-neutral-500">Run: {status}</p> : null}
        </section>
      ) : null}

      {currentRoomDetail && currentRoomDetail.stageRuns.length > 0 ? (
        <section className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium">Stage Run History</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {currentRoomDetail.stageRuns
              .filter((r) => r.stage === "layout" || r.stage === "render" || r.stage === "panorama")
              .map((run) => {
                const isActive = activeRunId(currentRoomDetail.stageRuns, run.stage) === run.id;
                const canRestore =
                  (run.status === "success" || run.status === "confirmed") && !isActive;
                return (
                  <li
                    key={run.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2"
                  >
                    <span>
                      {run.stage} — {run.status}
                      {run.stale ? " (stale)" : isActive ? " (current)" : ""}
                    </span>
                    {canRestore ? (
                      <button
                        type="button"
                        className="rounded-full border border-neutral-400 px-3 py-1 text-xs"
                        disabled={busy}
                        onClick={() => void restoreRun(run.id)}
                      >
                        Restore
                      </button>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </section>
      ) : null}

      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} /> : null}

      <MockPaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        message={paymentMessage}
        onPurchased={() => window.location.reload()}
      />
    </div>
  );
}
