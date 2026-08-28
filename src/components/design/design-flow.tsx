"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
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
import { DesignForm } from "./design-form";
import type { DesignFormHandle } from "./design-form";
import { ResultSlider } from "./result-slider";
import { Toast } from "./toast";
import { Uploader } from "./uploader";
import { DesignHistory } from "./design-history";
import { ToolMarketingSections } from "./tool-marketing-sections";
import {
  IconSparkles,
  IconCheck,
  IconImagePlus,
} from "@/components/shell/icons";

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
  initialPreset: initialPresetProp,
}: DesignFlowProps) {
  const { user } = useSession();
  const [sourceAssetId, setSourceAssetId] = useState<string | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [currentPreset, setCurrentPreset] = useState<DesignPreset | undefined>(initialPresetProp);
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
    setTimeout(() => setToast(null), 6_000);
  }

  function handleUploadReady(assetId: string, file: File, previewUrl: string) {
    setSourceAssetId(assetId);
    setUploadedFile(file);
    setSourcePreviewUrl(previewUrl);
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
    []
  );

  const pollTask = useCallback(
    async (taskId: string, sourceAssetId: string) => {
      stopPolling();
      setPolling(true);
      setStatus("queued");

      const session = {
        taskId,
        sourceAssetId,
        start: Date.now(),
        timer: null as ReturnType<typeof setInterval> | null,
      };
      activeRef.current = session;

      const poll = async () => {
        if (!activeRef.current || activeRef.current !== session) return;
        if (Date.now() - session.start > CLIENT_POLL_MAX_WAIT_MS) {
          stopPolling();
          setStatus("timeout");
          showToast(
            "Task is taking longer than expected. Check back in your Library soon."
          );
          return;
        }

        try {
          const res = await fetch(`/api/designs/${taskId}`, {
            headers: { Accept: "application/json" },
            credentials: "same-origin",
          });

          if (!activeRef.current || activeRef.current !== session) return;

          if (!res.ok) {
            stopPolling();
            setStatus("error");
            showToast(`Status check failed (${res.status})`, "error");
            return;
          }

          const json = (await res.json()) as {
            code: number;
            data?: StatusView;
            error?: string;
          };

          if (!activeRef.current || activeRef.current !== session) return;

          if (json.code !== 0 || !json.data) {
            stopPolling();
            setStatus("error");
            showToast(json.error ?? "Status check failed", "error");
            return;
          }

          const data = json.data;
          setStatus(data.internalStatus);

          if (data.status === "success") {
            stopPolling();
            appendResult(data, sourceAssetId);
          } else if (data.status === "failed") {
            stopPolling();
            appendResult(data, sourceAssetId);
            showToast(
              `Generation failed: ${data.errorCode ?? "unknown error"}`,
              "error"
            );
          }
        } catch {
          // Retry on transient network errors
        }
      };

      await poll();
      if (activeRef.current === session) {
        session.timer = setInterval(poll, CLIENT_POLL_INTERVAL_MS);
      }
    },
    [appendResult, stopPolling]
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
    if (polling) return;

    setStatus("submitting");

    const res = await fetch("/api/designs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
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
        setPaymentMessage(
          json.reason ?? "You need more Credits to generate."
        );
        setPaymentOpen(true);
        return;
      }
      if (isEmailNotVerifiedError(res.status, json.error)) {
        showToast(EMAIL_VERIFY_MESSAGE, "error");
        return;
      }
      showToast(
        json.reason ?? json.error ?? `Generate failed (${res.status})`,
        "error"
      );
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

  const heroFloatingImg =
    scene === "exterior"
      ? "/ai-exterior-design/hero-floating-house-model.webp"
      : "/ai-interior-design/hero-floating-room-model.webp";

  const heroPromptCaption =
    scene === "exterior"
      ? "Modern farmhouse facade, board-and-batten siding, black-framed windows, warm porch lighting, fresh landscaping"
      : "Modern organic living room, warm neutrals, natural light, olive green accents, wooden textures";

  const scrollToGenerator = () => {
    const el = document.getElementById("generator-card");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex flex-col">
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onClose={() => setToast(null)}
      />

      {/* 1. Top Hero Section Matching Origin 1:1 */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-12 pb-8 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          {/* Left Hero Text */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <IconSparkles className="size-4 text-brand-copper" />
              <span className="text-xs font-bold tracking-[0.2em] uppercase text-brand-copper">
                {scene === "exterior" ? "AI EXTERIOR DESIGN" : "AI INTERIOR DESIGN"}
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-foreground leading-[1.08]">
              {scene === "exterior" ? (
                <>
                  AI<br />Exterior<br />Design
                </>
              ) : (
                <>
                  AI<br />Interior<br />Design
                </>
              )}
            </h1>

            <p className="mt-6 text-base sm:text-lg leading-relaxed text-foreground/75 max-w-lg">
              {scene === "exterior"
                ? "Upload a photo of your house and instantly generate realistic AI exterior design ideas for your facade, yard, porch, or driveway."
                : "Upload a photo of any room and instantly generate warm, realistic AI interior design ideas tailored to your space."}
            </p>

            {/* Checklist */}
            <div className="mt-6 flex flex-wrap gap-4 text-xs font-semibold text-foreground/80">
              <div className="flex items-center gap-1.5">
                <span className="flex size-4 items-center justify-center rounded-full bg-brand-primary text-white">
                  <IconCheck className="size-2.5" />
                </span>
                <span>{scene === "exterior" ? "Instant Curb Appeal" : "Instant AI Results"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex size-4 items-center justify-center rounded-full bg-brand-primary text-white">
                  <IconCheck className="size-2.5" />
                </span>
                <span>{scene === "exterior" ? "Any Style, Any Facade" : "Any Style, Any Room"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex size-4 items-center justify-center rounded-full bg-brand-primary text-white">
                  <IconCheck className="size-2.5" />
                </span>
                <span>{scene === "exterior" ? "Renovate with Confidence" : "Your Space, Your Rules"}</span>
              </div>
            </div>

            {/* CTA Button */}
            <div className="mt-8">
              <button
                type="button"
                onClick={scrollToGenerator}
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-primary px-6 text-sm font-semibold text-white shadow-md transition-all hover:bg-brand-accent active:translate-y-px"
              >
                <IconImagePlus className="size-4" />
                <span>{scene === "exterior" ? "Design My Exterior Now" : "Upload Your Room Photo"}</span>
              </button>
            </div>
          </div>

          {/* Right Hero 3D Floating Model + Caption */}
          <div className="flex flex-col items-center">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl">
              <Image
                src={heroFloatingImg}
                alt="3D room model"
                fill
                priority
                className="object-contain transition-transform duration-500 hover:scale-105"
              />
            </div>
            <div className="mt-3 rounded-full border border-border/80 bg-card/90 px-4 py-2 text-center text-xs text-foreground/75 shadow-xs backdrop-blur-xs max-w-md">
              <strong className="font-semibold text-foreground">Prompt:</strong> {heroPromptCaption}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Main Tool Generator Card Container Matching Image 1 Exactly */}
      <section
        id="generator-card"
        className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"
      >
        <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-sm">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_380px] items-start">
            {/* Left Column: Upload & History */}
            <div className="flex min-w-0 flex-col">
              <h2 className="text-xl font-bold tracking-tight text-foreground mb-4">
                {title}
              </h2>

              {polling && (
                <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-[#fbf9f5] p-5 shadow-xs animate-pulse">
                  <div className="size-4 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                  <span className="text-sm font-semibold text-foreground">
                    AI is generating your design ({status})…
                  </span>
                </div>
              )}

              {activeRecord?.status === "success" && activeRecord.outputAssetId ? (
                <div className="rounded-2xl border border-border bg-[#fbf9f5] p-5 shadow-xs">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm font-bold text-foreground">
                      Generated Result
                    </span>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/assets/${activeRecord.outputAssetId}/download`}
                        className="rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-black/5"
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        onClick={handleRegenerate}
                        className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-accent shadow-xs"
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
                </div>
              ) : (
                <Uploader
                  scene={scene}
                  sceneLabel={sceneLabel}
                  disabled={polling}
                  onReady={handleUploadReady}
                  onError={(msg) => showToast(msg, "error")}
                />
              )}

              {/* History Box (4 cards) */}
              <DesignHistory
                scene={scene}
                history={history}
                activeId={activeId}
                onSelect={setActiveId}
              />
            </div>

            {/* Right Column: Form Controls Form */}
            <div className="rounded-2xl border border-border/80 bg-[#fbf9f5] p-5">
              <DesignForm
                scene={scene}
                sourceAssetId={sourceAssetId}
                sourcePreviewUrl={sourcePreviewUrl}
                initialPreset={currentPreset}
                disabled={polling}
                onGenerate={handleGenerate}
                onToast={showToast}
                ref={formRef}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 3. Marketing Showcase Sections Below Generator */}
      <ToolMarketingSections
        scene={scene}
        onSelectPreset={(p) => {
          setCurrentPreset(p);
          scrollToGenerator();
        }}
      />

      <MockPaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        message={paymentMessage}
        onPurchased={() => window.location.reload()}
      />
    </div>
  );
}
