"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth/session-stub";
import {
  EMAIL_VERIFY_MESSAGE,
  isEmailNotVerifiedError,
  isInsufficientCreditsError,
} from "@/lib/auth/verify-message";
import {
  CLIENT_POLL_INTERVAL_MS,
  CLIENT_POLL_MAX_WAIT_MS,
} from "@/lib/ai/types";
import type { DesignPreset } from "@/lib/design/state";
import { MockPaymentModal } from "@/components/payments/mock-payment-modal";
import { DesignCatalogGalleries } from "./design-catalog-galleries";
import { DesignForm } from "./design-form";
import type { DesignFormHandle } from "./design-form";
import { ResultSlider } from "./result-slider";
import { Toast } from "./toast";
import { Uploader } from "./uploader";

interface DesignFlowProps {
  scene: "interior" | "exterior";
  title: string;
  description: string;
  sceneLabel: string;
  initialPreset?: DesignPreset;
}

interface GenerationRecord {
  id: string;
  sourceAssetId: string;
  status: string;
  outputAssetId: string | null;
  cost: number;
  createdAt: number;
  errorCode: string | null;
}

interface StatusView {
  id: string;
  status: "processing" | "success" | "failed";
  internalStatus: string;
  outputAssetId: string | null;
  errorCode: string | null;
  cost: number;
  sourceAssetId: string | null;
}

export function DesignFlow({
  scene,
  title,
  description,
  sceneLabel,
  initialPreset,
}: DesignFlowProps) {
  const { user } = useSession();
  const [sourceAssetId, setSourceAssetId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [toast, setToast] = useState<{ message: string; variant?: "error" } | null>(null);
  const [polling, setPolling] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const formRef = useRef<DesignFormHandle | null>(null);
  const activeRef = useRef<{
    taskId: string;
    sourceAssetId: string;
    start: number;
    timer: ReturnType<typeof setInterval> | null;
  } | null>(null);

  function showToast(message: string, variant?: "error") {
    setToast({ message, variant });
    // Auto-dismiss after 6s.
    setTimeout(() => setToast(null), 6_000);
  }

  function handleUploadReady(assetId: string, file: File) {
    setSourceAssetId(assetId);
    setUploadedFile(file);
  }

  const stopPolling = useCallback(() => {
    if (activeRef.current?.timer) {
      clearInterval(activeRef.current.timer);
      activeRef.current.timer = null;
    }
    setPolling(false);
  }, []);

  const appendResult = useCallback(
    (view: StatusView, sourceAssetId: string) => {
      setHistory((prev) => {
        if (prev.some((r) => r.id === view.id)) return prev;
        const next = [
          ...prev,
          {
            id: view.id,
            sourceAssetId,
            status: view.status,
            outputAssetId: view.outputAssetId,
            cost: view.cost,
            createdAt: Date.now(),
            errorCode: view.errorCode,
          },
        ];
        return next;
      });
      setActiveId(view.id);
    },
  []);

  const pollTask = useCallback(
    async (taskId: string, sourceAssetId: string) => {
      const start = Date.now();

      const tick = async () => {
        try {
          const res = await fetch(`/api/designs/${taskId}`, {
            credentials: "same-origin",
            cache: "no-store",
          });

          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string };
            stopPolling();
            setStatus("error");
            showToast(err.error ?? `Poll failed (${res.status})`, "error");
            return;
          }

          const json = (await res.json()) as { code: number; data: StatusView };
          const view = json.data;
          setStatus(view.status);

          if (view.status === "success") {
            stopPolling();
            appendResult(view, sourceAssetId);
            showToast("Design ready!");
            return;
          }

          if (view.status === "failed") {
            stopPolling();
            appendResult(view, sourceAssetId);
            showToast(view.errorCode ?? "Design failed.", "error");
            return;
          }

          if (Date.now() - start >= CLIENT_POLL_MAX_WAIT_MS) {
            stopPolling();
            showToast(
              "Still processing on the server. You can leave this page and check your projects later.",
              "error"
            );
          }
        } catch {
          // Network hiccup — keep polling until deadline.
        }
      };

      activeRef.current = { taskId, sourceAssetId, start, timer: null };
      await tick();
      activeRef.current.timer = setInterval(tick, CLIENT_POLL_INTERVAL_MS);
      setPolling(true);
    },
    [stopPolling, appendResult]
  );

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  async function handleGenerate(
    body: Record<string, unknown>,
    currentSourceAssetId: string
  ) {
    if (!user) {
      showToast("Sign in to generate designs.", "error");
      return;
    }
    if (user.emailVerified === false) {
      showToast(EMAIL_VERIFY_MESSAGE, "error");
      return;
    }
    if (!currentSourceAssetId) {
      showToast("Please upload a photo first.", "error");
      return;
    }
    stopPolling();
    setStatus("processing");
    setActiveId(null);

    const res = await fetch("/api/designs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => ({}))) as {
      code?: number;
      data?: { id: string };
      error?: string;
      reason?: string;
    };

    if (!res.ok || json.code !== 0 || !json.data?.id) {
      setStatus("error");
      if (isInsufficientCreditsError(res.status, json.error)) {
        setPaymentMessage(json.reason ?? "You need more Credits to generate.");
        setPaymentOpen(true);
        return;
      }
      if (isEmailNotVerifiedError(res.status, json.error)) {
        showToast(EMAIL_VERIFY_MESSAGE, "error");
        return;
      }
      showToast(json.reason ?? json.error ?? `Generate failed (${res.status})`, "error");
      return;
    }

    void pollTask(json.data.id, currentSourceAssetId);
  }

  function handleRegenerate() {
    if (!sourceAssetId) {
      showToast("Please upload a photo first.", "error");
      return;
    }
    formRef.current?.generate();
  }
  const activeRecord = history.find((r) => r.id === activeId) ?? history.at(-1);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          {title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-ink/70">{description}</p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Left: result + history */}
        <div className="space-y-6">
          {polling && (
            <div className="rounded-card border border-ink/10 bg-paper p-4 text-sm text-ink/80">
              Processing… {status}
            </div>
          )}

          {activeRecord?.status === "success" && activeRecord.outputAssetId && (
            <section className="rounded-card border border-ink/10 bg-paper p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-ink">Result</h2>
                <div className="flex items-center gap-2">
                  <a
                    href={`/api/assets/${activeRecord.outputAssetId}/download`}
                    className="rounded-pill border border-ink/20 px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-ink/50"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    className="rounded-pill bg-ink px-4 py-2 text-xs font-medium text-paper transition-opacity hover:opacity-80"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
              <ResultSlider
                beforeSrc={
                  uploadedFile
                    ? URL.createObjectURL(uploadedFile)
                    : `/api/assets/${activeRecord.sourceAssetId}/download`
                }
                afterSrc={`/api/assets/${activeRecord.outputAssetId}/download`}
              />
            </section>
          )}

          {activeRecord?.status === "failed" && (
            <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Generation failed: {activeRecord.errorCode ?? "unknown error"}
              <button
                type="button"
                onClick={handleRegenerate}
                className="ml-4 rounded-pill bg-ink px-4 py-2 text-xs font-medium text-paper transition-opacity hover:opacity-80"
              >
                Try again
              </button>
            </div>
          )}

          {history.length > 0 && (
            <section>
              <h2 className="font-semibold text-ink">History</h2>
              <ul className="mt-3 space-y-2">
                {history.map((record) => (
                  <li
                    key={record.id}
                    className={
                      "flex items-center justify-between rounded-card border p-3 text-sm" +
                      (record.id === activeId
                        ? " border-ink bg-ink/5"
                        : " border-ink/10 bg-paper")
                    }
                  >
                    <button
                      type="button"
                      onClick={() => setActiveId(record.id)}
                      className="text-left text-ink hover:underline"
                    >
                      {new Date(record.createdAt).toLocaleString()}
                    </button>
                    <span className="text-xs text-ink/60">
                      {record.status} · {record.cost} Credits
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Right: upload + controls */}
        <aside className="space-y-6">
          <Toast
            message={toast?.message ?? null}
            variant={toast?.variant}
            onClose={() => setToast(null)}
          />

          <section className="rounded-card border border-ink/10 bg-paper p-5 shadow-sm">
            <h2 className="font-semibold text-ink">Upload</h2>
            <div className="mt-4">
              <Uploader
                sceneLabel={sceneLabel}
                disabled={polling}
                onReady={handleUploadReady}
                onError={(msg) => showToast(msg, "error")}
              />
            </div>
          </section>

          <section className="rounded-card border border-ink/10 bg-paper p-5 shadow-sm">
            <h2 className="font-semibold text-ink">Design</h2>
            <div className="mt-4">
              <DesignForm
                scene={scene}
                sourceAssetId={sourceAssetId}
                initialPreset={initialPreset}
                disabled={polling}
                onGenerate={handleGenerate}
                onToast={showToast}
                ref={formRef}
              />
            </div>
          </section>
        </aside>
      </div>

      <DesignCatalogGalleries scene={scene} />

      <MockPaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        message={paymentMessage}
        onPurchased={() => window.location.reload()}
      />
    </main>
  );
}
