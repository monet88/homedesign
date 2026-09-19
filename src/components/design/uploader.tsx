"use client";

import { useRef, useState } from "react";
import { uploadAsset } from "@/lib/intake/client";
import { useTranslation } from "@/lib/i18n/context";
import { IconImagePlus } from "@/components/shell/icons";

const VALID_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_SIZE_BYTES = 50 * 1024 * 1024;

interface UploaderProps {
  scene: "interior" | "exterior" | "floor-plan";
  sceneLabel: string;
  disabled?: boolean;
  onReady: (assetId: string, file: File, previewUrl: string) => void;
  onError: (message: string) => void;
}

const INTERIOR_EXAMPLES = [
  {
    name: "Warm modern living room",
    thumb: "/ai-interior-design/before-after/empty-living-room-before.webp",
  },
  {
    name: "Scandinavian bedroom",
    thumb: "/ai-interior-design/rooms/bedroom.webp",
  },
  {
    name: "Luxury kitchen",
    thumb: "/ai-interior-design/rooms/kitchen.webp",
  },
  {
    name: "Home office",
    thumb: "/ai-interior-design/rooms/home-office.webp",
  },
];

const EXTERIOR_EXAMPLES = [
  {
    name: "Modern facade",
    thumb: "/ai-exterior-design/examples/modern-facade.webp",
  },
  {
    name: "Farmhouse facade",
    thumb: "/ai-exterior-design/examples/farmhouse-facade.webp",
  },
  {
    name: "Craftsman porch",
    thumb: "/ai-exterior-design/examples/craftsman-porch.webp",
  },
  {
    name: "Mediterranean house",
    thumb: "/ai-exterior-design/examples/mediterranean-house.webp",
  },
];

const FLOOR_PLAN_EXAMPLES = [
  {
    name: "Architectural floor plan",
    thumb: "/assets/ai-floor-plan/hero-floor-plan-cutout.webp",
  },
  {
    name: "2D room blueprint",
    thumb: "/landing/feature-floor-plan.webp",
  },
];

async function compressImageForUpload(file: File): Promise<File> {
  // If already small (< 1.5MB) or SVG/unsupported, skip canvas compression
  if (file.size <= 1.5 * 1024 * 1024 || file.type === "image/svg+xml") {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDimension = 2048;
      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Prefer WebP for modern browsers, fallback to JPEG
      const mimeType = file.type === "image/png" ? "image/png" : "image/webp";
      const quality = mimeType === "image/webp" ? 0.88 : 0.90;

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file); // fallback to original if compression didn't help
            return;
          }
          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".webp"), {
            type: mimeType,
            lastModified: Date.now(),
          });
          resolve(compressedFile);
        },
        mimeType,
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

export function Uploader({
  scene,
  sceneLabel,
  disabled,
  onReady,
  onError,
}: UploaderProps) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<"compressing" | "uploading" | "ready">("compressing");
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const examples =
    scene === "exterior"
      ? EXTERIOR_EXAMPLES
      : scene === "floor-plan"
      ? FLOOR_PLAN_EXAMPLES
      : INTERIOR_EXAMPLES;

  async function handleFile(file: File) {
    if (!VALID_TYPES.includes(file.type) && !file.type.startsWith("image/")) {
      onError("Please upload a PNG, JPG, or WebP image.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      onError("Image must be 50MB or smaller.");
      return;
    }

    // Instant local preview for zero-perceived-latency
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setUploading(true);

    try {
      let targetFile = file;
      if (file.size > 1.5 * 1024 * 1024 && file.type !== "image/svg+xml") {
        setUploadStage("compressing");
        targetFile = await compressImageForUpload(file);
      }

      // Upload to Cloudflare R2
      setUploadStage("uploading");
      const result = await uploadAsset(targetFile);

      if (!result.ok) {
        setUploading(false);
        onError(result.error);
        setPreviewUrl(null);
        return;
      }

      setUploadStage("ready");
      setUploading(false);
      onReady(result.assetId, targetFile, objectUrl);
    } catch {
      setUploading(false);
      onError("Không thể tải ảnh lên. Vui lòng thử lại.");
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  async function loadSample(sampleUrl: string, name: string) {
    try {
      setUploading(true);
      const res = await fetch(sampleUrl);
      const blob = await res.blob();
      const file = new File([blob], `${name.toLowerCase().replace(/\s+/g, "-")}.webp`, {
        type: "image/webp",
      });
      await handleFile(file);
    } catch {
      setUploading(false);
      onError("Could not load sample image.");
    }
  }

  return (
    <div className="flex flex-col">
      {/* Upload Dropzone Box */}
      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all p-8 text-center ${
          isDragging
            ? "border-brand-primary bg-brand-primary/10"
            : "border-border/80 bg-muted/40 hover:border-brand-primary/50 hover:bg-muted/60"
        } ${
          disabled ? "pointer-events-none opacity-50" : ""
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          onChange={handleChange}
          disabled={disabled || uploading}
          className="sr-only"
          aria-label={`Upload a ${sceneLabel} photo`}
        />

        {previewUrl ? (
          <div className="relative aspect-video max-h-72 w-full overflow-hidden rounded-xl bg-black/5">
            <img
              src={previewUrl}
              alt="Upload preview"
              className="h-full w-full object-contain"
            />
            <div
              onClick={() => inputRef.current?.click()}
              className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/30 opacity-0 transition-opacity hover:opacity-100"
            >
              <span className="rounded-full bg-card px-4 py-1.5 text-xs font-semibold text-foreground shadow-sm">
                Click or drop to replace photo
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center w-full">
            <div
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center cursor-pointer py-4"
            >
              <IconImagePlus className="size-12 text-brand-primary/70 mb-3" />
              <p className="text-base font-bold text-foreground">
                {t.studio.uploadTitle}
              </p>
              <p className="mt-1 text-xs font-semibold text-foreground/85">
                {t.studio.uploadHint}
              </p>
              <p className="mt-0.5 text-xs text-foreground/60">
                {t.studio.uploadSubhint}
              </p>
            </div>

            {/* Sub-divider */}
            <div className="my-6 flex w-full items-center gap-3">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[11px] font-bold tracking-wider uppercase text-foreground/60">
                {t.studio.examplesTitle}
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>

            {/* 4 Image Thumbnails Grid */}
            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
              {examples.map((ex) => (
                <button
                  key={ex.name}
                  type="button"
                  onClick={() => void loadSample(ex.thumb, ex.name)}
                  className="group relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs transition-all hover:scale-105 hover:shadow-md"
                >
                  <img
                    src={ex.thumb}
                    alt={ex.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/10 transition-opacity group-hover:bg-transparent" />
                </button>
              ))}
            </div>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/85 backdrop-blur-md rounded-2xl p-6 transition-all z-20">
            <div className="relative flex size-14 items-center justify-center rounded-2xl bg-brand-primary/10 border border-brand-primary/20 mb-3 shadow-inner">
              <div className="size-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
              <div className="absolute inset-0 rounded-2xl animate-ping opacity-20 bg-brand-primary" />
            </div>

            <p className="text-sm font-bold text-foreground">
              {uploadStage === "compressing" && "Đang tối ưu & chuẩn hóa kích thước ảnh..."}
              {uploadStage === "uploading" && "Đang đồng bộ ảnh lên Studio Cloud..."}
              {uploadStage === "ready" && "Sẵn sàng tạo phối cảnh AI"}
            </p>

            <div className="mt-3 w-48 h-1.5 rounded-full bg-border/60 overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r from-brand-primary to-amber-500 transition-all duration-300 ${
                  uploadStage === "compressing"
                    ? "w-1/3"
                    : uploadStage === "uploading"
                    ? "w-4/5 animate-pulse"
                    : "w-full"
                }`}
              />
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground font-medium">
              {uploadStage === "compressing"
                ? "Tự động nén kích thước siêu nét, tiết kiệm dữ liệu"
                : "Mã hóa và lưu trữ an toàn trong dự án của bạn"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
