"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSession } from "@/lib/auth/session-stub";
import { useTranslation } from "@/lib/i18n/context";
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
import { PitchDeckModal } from "./pitch-deck-modal";
import { BatchRenderModal } from "./batch-render-modal";
import { WatermarkOverlay } from "./watermark-overlay";
import { GeneratingScanner } from "./generating-scanner";
import {
  IconSparkles,
  IconCheck,
  IconImagePlus,
} from "@/components/shell/icons";

import { useWorkspace } from "@/components/workspaces/workspace-context";
import { StudioPresetsModal } from "@/components/presets/studio-presets-modal";
import type { CustomPreset } from "@/lib/presets/custom-presets";

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
  const { t, lang } = useTranslation();
  const isVi = lang === "vi";
  const { activeWorkspace } = useWorkspace();
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
  const [pitchDeckOpen, setPitchDeckOpen] = useState(false);
  const [upscaling, setUpscaling] = useState(false);
  const [upscaledMap, setUpscaledMap] = useState<Record<string, boolean>>({});
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [currentModelName, setCurrentModelName] = useState<string>("Google Gemini 2.5 Flash Image");

  // Studio custom presets state
  const [studioPresets, setStudioPresets] = useState<CustomPreset[]>([]);
  const [selectedCustomPresetId, setSelectedCustomPresetId] = useState<string>("");
  const [studioPresetsModalOpen, setStudioPresetsModalOpen] = useState(false);

  // Load custom presets when activeWorkspace changes
  useEffect(() => {
    if (!activeWorkspace?.id) {
      setStudioPresets([]);
      setSelectedCustomPresetId("");
      return;
    }
    async function fetchStudioPresets() {
      try {
        const res = await fetch(`/api/presets/custom?workspaceId=${activeWorkspace!.id}`);
        const json = (await res.json()) as any;
        if (json.code === 0 && Array.isArray(json.data?.presets)) {
          setStudioPresets(json.data.presets);
        }
      } catch {
        // ignore
      }
    }
    fetchStudioPresets();
  }, [activeWorkspace?.id]);

  const handleUpscale4k = async (recordId: string, outputAssetId: string) => {
    if (upscaling) return;
    if (activeWorkspace?.role === "viewer") {
      showToast("Tài khoản Viewer chỉ có quyền xem dự án, không thể nâng cấp ảnh.", "error");
      return;
    }
    setUpscaling(true);
    try {
      const res = await fetch("/api/ai/upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId: recordId,
          outputAssetId,
          workspaceId: activeWorkspace?.id,
        }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        if (res.status === 402) {
          setPaymentMessage(data.message || "Bạn cần 2 credits để nâng cấp ảnh 4K Ultra-HD.");
          setPaymentOpen(true);
          return;
        }
        if (res.status === 403) {
          throw new Error(data.message || "Bạn không có quyền thực hiện thao tác này trong Studio.");
        }
        throw new Error(data.message || "Lỗi nâng cấp ảnh 4K");
      }
      setUpscaledMap((prev) => ({ ...prev, [recordId]: true }));
      showToast(
        activeWorkspace
          ? `Đã nâng cấp ảnh 4K thành công! (Trừ 2 credits từ Quỹ Studio "${activeWorkspace.name}")`
          : "Đã nâng cấp ảnh thành công lên chuẩn 4K Ultra-HD! (Trừ 2 credits)"
      );
    } catch (err: any) {
      showToast(err.message || "Không thể nâng cấp ảnh 4K lúc này", "error");
    } finally {
      setUpscaling(false);
    }
  };

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

    const modelNameMap: Record<string, string> = {
      "gemini-2.5-flash-image": "Google Gemini 2.5 Flash Image",
      "fal-ai/flux/schnell": "Fal.ai Flux Schnell (1-2s)",
      "black-forest-labs/flux-schnell": "Replicate Flux Schnell",
      smart: "Smart Auto-Failover (Fal 1s ➔ Gemini)",
      gemini: "Google Gemini 2.5 Flash Image",
      fal: "Fal.ai Flux Schnell (1-2s)",
    };
    const reqModel = String(body.model || "gemini-2.5-flash-image");
    setCurrentModelName(modelNameMap[reqModel] || reqModel);

    if (activeWorkspace) {
      if (activeWorkspace.role === "viewer") {
        showToast("Tài khoản Viewer chỉ có quyền xem dự án trong Studio, không thể sinh ảnh mới.", "error");
        return;
      }
      body.workspaceId = activeWorkspace.id;
      if (selectedCustomPresetId) {
        body.customPresetId = selectedCustomPresetId;
        if (body.intent && typeof body.intent === "object") {
          (body.intent as Record<string, unknown>).customPresetId = selectedCustomPresetId;
        }
      }
    }

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
      if (json.error === "ROLE_CANNOT_GENERATE") {
        showToast("Tài khoản Viewer không có quyền sinh ảnh trong Studio.", "error");
        return;
      }
      if (json.error === "WORKSPACE_BALANCE_INSUFFICIENT") {
        setPaymentMessage(
          `Quỹ Credits của Studio "${activeWorkspace?.name || ""}" đã hết (${json.reason || ""}). Vui lòng nạp thêm credits vào Quỹ Studio.`
        );
        setPaymentOpen(true);
        return;
      }
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
      ? (isVi
          ? "Gợi ý: Mặt tiền biệt thự hiện đại, ốp gỗ ấm cúng, cửa kính khung đen, đèn hiên vàng ấm, sân vườn xanh mát"
          : "Modern farmhouse facade, board-and-batten siding, black-framed windows, warm porch lighting, fresh landscaping")
      : (isVi
          ? "Gợi ý: Phòng khách phong cách Hiện Đại Ấm Cúng, ánh sáng tự nhiên, sofa màu trung tính, điểm nhấn xanh olive, vân gỗ sồi"
          : "Modern organic living room, warm neutrals, natural light, olive green accents, wooden textures");

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
                {isVi
                  ? (scene === "exterior" ? "THIẾT KẾ NGOẠI THẤT AI" : "THIẾT KẾ NỘI THẤT AI")
                  : (title ? title.toUpperCase() : scene === "exterior" ? "AI EXTERIOR DESIGN" : "AI INTERIOR DESIGN")}
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-foreground leading-[1.08]">
              {isVi
                ? (scene === "exterior" ? "Thiết Kế Ngoại Thất AI" : "Thiết Kế Nội Thất AI")
                : (title ?? (scene === "exterior" ? "AI Exterior Design" : "AI Interior Design"))}
            </h1>

            <p className="mt-6 text-base sm:text-lg leading-relaxed text-foreground/75 max-w-lg">
              {isVi
                ? (scene === "exterior"
                    ? "Tải ảnh ngôi nhà của bạn và để AI tức thì sáng tạo phối cảnh ngoại thất chân thực cho mặt tiền, sân vườn, hiên nhà hoặc lối đi."
                    : "Tải ảnh căn phòng hiện trạng để HomeDesign AI kiến tạo không gian nội thất ấm cúng, chân thực chỉ trong vài giây.")
                : (description ?? (scene === "exterior"
                    ? "Upload a photo of your house and instantly generate realistic AI exterior design ideas for your facade, yard, porch, or driveway."
                    : "Upload a photo of any room and instantly generate warm, realistic AI interior design ideas tailored to your space."))}
            </p>

            {/* Checklist */}
            <div className="mt-6 flex flex-wrap gap-4 text-xs font-semibold text-foreground/80">
              <div className="flex items-center gap-1.5">
                <span className="flex size-4 items-center justify-center rounded-full bg-brand-primary text-white">
                  <IconCheck className="size-2.5" />
                </span>
                <span>
                  {isVi
                    ? (scene === "exterior" ? "Nâng Tầm Mặt Tiền Tức Thì" : "Kết Quả AI Tức Thì")
                    : (scene === "exterior" ? "Instant Curb Appeal" : "Instant AI Results")}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex size-4 items-center justify-center rounded-full bg-brand-primary text-white">
                  <IconCheck className="size-2.5" />
                </span>
                <span>
                  {isVi
                    ? (scene === "exterior" ? "Mọi Phong Cách, Mọi Mặt Tiền" : "Đa Dạng Phong Cách & Không Gian")
                    : (scene === "exterior" ? "Any Style, Any Facade" : "Any Style, Any Room")}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex size-4 items-center justify-center rounded-full bg-brand-primary text-white">
                  <IconCheck className="size-2.5" />
                </span>
                <span>
                  {isVi
                    ? (scene === "exterior" ? "Thi Công Với Sự Tự Tin" : "Đúng Kết Cấu, Chuẩn Bản Vẽ")
                    : (scene === "exterior" ? "Renovate with Confidence" : "Your Space, Your Rules")}
                </span>
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
                <span>
                  {isVi
                    ? (scene === "exterior" ? "Thiết Kế Ngoại Thất Ngay" : "Tải Ảnh Căn Phòng Lên")
                    : (scene === "exterior" ? "Design My Exterior Now" : "Upload Your Room Photo")}
                </span>
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
              <strong className="font-semibold text-foreground">{isVi ? "Prompt Gợi Ý:" : "Prompt:"}</strong> {heroPromptCaption}
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
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={() => setBatchModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 px-3.5 py-1.5 text-xs font-bold text-stone-950 shadow-md shadow-amber-500/15 transition-all"
                  title="Render đồng bộ cả căn hộ (tối đa 8 phòng) trong nền siêu tốc"
                >
                  <span>⚡ Render Căn Hộ (Hàng Loạt)</span>
                </button>
              </div>

              {polling ? (
                <div className="mb-6">
                  <GeneratingScanner
                    previewSrc={sourcePreviewUrl}
                    status={status || "processing"}
                    modelName={currentModelName}
                    roomType={currentPreset?.roomType}
                    designStyle={currentPreset?.style}
                  />
                </div>
              ) : activeRecord?.status === "success" && activeRecord.outputAssetId ? (
                <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm font-bold text-foreground">
                      {t.studio.generatedResult}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {upscaledMap[activeRecord.id] ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-[11px] font-bold text-emerald-600">
                          ✓ 4K Ultra-HD
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleUpscale4k(activeRecord.id, activeRecord.outputAssetId!)}
                          disabled={upscaling}
                          className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-700 hover:bg-amber-500/20 transition-all disabled:opacity-50"
                          title="Làm nét chi tiết ảnh lên 4K Ultra-HD (Chi phí: 2 Credits)"
                        >
                          <svg className="size-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span>{upscaling ? "Đang xử lý 4K..." : "Nâng cấp 4K (2c)"}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setPitchDeckOpen(true)}
                        className="inline-flex items-center gap-1 rounded-full border border-brand-primary/40 bg-brand-primary/10 px-3 py-1 text-xs font-bold text-brand-primary hover:bg-brand-primary/20 transition-all"
                        title="Xuất hồ sơ thuyết minh dự án PDF A4 Landscape"
                      >
                        <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>Hồ Sơ PDF</span>
                      </button>

                      <a
                        href={`/api/assets/${activeRecord.outputAssetId}/download`}
                        className="rounded-full border border-border bg-card px-3.5 py-1 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                      >
                        {t.studio.download}
                      </a>
                      <button
                        type="button"
                        onClick={handleRegenerate}
                        className="rounded-full bg-brand-primary px-3.5 py-1 text-xs font-semibold text-white hover:bg-brand-accent shadow-xs"
                      >
                        {t.studio.regenerate}
                      </button>
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl">
                    <ResultSlider
                      beforeSrc={
                        uploadedFile
                          ? URL.createObjectURL(uploadedFile)
                          : `/api/assets/${activeRecord.sourceAssetId}/download`
                      }
                      afterSrc={`/api/assets/${activeRecord.outputAssetId}/download`}
                    />
                    <WatermarkOverlay />
                  </div>
                </div>
              ) : activeRecord?.status === "failed" ? (
                <div className="rounded-2xl border border-red-200 bg-red-50/50 p-6 shadow-xs text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-3">
                    <span className="text-xl font-bold">!</span>
                  </div>
                  <h3 className="text-base font-bold text-red-900">
                    AI Generation Encountered An Issue
                  </h3>
                  <p className="mt-1.5 text-xs text-red-700 max-w-md mx-auto">
                    {activeRecord.errorCode ? `Reason: ${activeRecord.errorCode}. ` : ""}
                    No worries! <strong>Your 1 credit was safely refunded</strong> to your account automatically.
                  </p>
                  <div className="mt-5 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={handleRegenerate}
                      disabled={polling}
                      className="rounded-full bg-brand-primary px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-accent transition-all disabled:opacity-50"
                    >
                      Try Again
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveId(null)}
                      className="rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-black/5"
                    >
                      Upload New Image
                    </button>
                  </div>
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
            <div className="flex flex-col gap-4">
              {activeWorkspace && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🏢</span>
                      <div>
                        <span className="font-bold text-foreground">{activeWorkspace.name}</span>
                        <span className="ml-2 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-brand-primary dark:text-amber-400 uppercase">
                          {activeWorkspace.role}
                        </span>
                      </div>
                    </div>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {activeWorkspace.availableCredits ?? 0} credits
                    </span>
                  </div>

                  {activeWorkspace.role === "viewer" ? (
                    <div className="mt-2 rounded-xl bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-300">
                      ⚠️ Bạn đang ở vai trò <strong>Viewer</strong> (Chỉ xem). Bạn có thể xem lịch sử thiết kế nhưng không thể tiêu hao credits để sinh ảnh mới.
                    </div>
                  ) : (
                    <div className="mt-2.5 pt-2.5 border-t border-amber-500/20 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="font-semibold text-foreground/80 text-[11px]">
                          Bộ phong cách Studio (Custom Presets):
                        </label>
                        <button
                          type="button"
                          onClick={() => setStudioPresetsModalOpen(true)}
                          className="text-[10px] font-bold text-brand-primary hover:underline"
                        >
                          + Quản lý Presets
                        </button>
                      </div>
                      <select
                        value={selectedCustomPresetId}
                        onChange={(e) => setSelectedCustomPresetId(e.target.value)}
                        className="w-full rounded-xl border border-amber-500/30 bg-card p-2 text-xs text-foreground outline-none focus:border-brand-primary"
                      >
                        <option value="">-- Phong cách tự do / Mặc định --</option>
                        {studioPresets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.scene})
                          </option>
                        ))}
                      </select>
                      {selectedCustomPresetId && (
                        <p className="text-[10px] text-foreground/60 italic">
                          Chỉ thị vật liệu & ánh sáng của Studio sẽ được tự động tích hợp vào bản vẽ AI.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-border/80 bg-[#fbf9f5] dark:bg-card p-5">
                <DesignForm
                  scene={scene}
                  sourceAssetId={sourceAssetId}
                  sourcePreviewUrl={sourcePreviewUrl}
                  initialPreset={currentPreset}
                  disabled={polling || activeWorkspace?.role === "viewer"}
                  onGenerate={handleGenerate}
                  onToast={showToast}
                  ref={formRef}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <StudioPresetsModal
        open={studioPresetsModalOpen}
        onClose={() => setStudioPresetsModalOpen(false)}
        onPresetCreated={(preset) => {
          setStudioPresets((prev) => [...prev, preset]);
          setSelectedCustomPresetId(preset.id);
        }}
      />

      {/* 3. Marketing Showcase Sections Below Generator */}
      <ToolMarketingSections
        scene={scene}
        onSelectPreset={(p) => {
          setCurrentPreset({ ...p });
          setToast({
            message: isVi
              ? `Đã áp dụng phong cách "${p.style || "Tùy chỉnh"}" vào bảng điều khiển!`
              : `Applied style "${p.style || "Custom"}" to generator!`,
          });
          scrollToGenerator();
        }}
      />

      <MockPaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        message={paymentMessage}
        onPurchased={() => window.location.reload()}
      />

      {activeRecord?.status === "success" && activeRecord.outputAssetId && (
        <PitchDeckModal
          open={pitchDeckOpen}
          onClose={() => setPitchDeckOpen(false)}
          beforeSrc={
            uploadedFile
              ? URL.createObjectURL(uploadedFile)
              : `/api/assets/${activeRecord.sourceAssetId}/download`
          }
          afterSrc={`/api/assets/${activeRecord.outputAssetId}/download`}
          defaultProjectName={title}
          defaultRoomType={sceneLabel}
        />
      )}

      <BatchRenderModal
        open={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        onOpenPitchDeck={() => setPitchDeckOpen(true)}
      />
    </div>
  );
}
