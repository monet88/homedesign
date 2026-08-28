"use client";

import { useRef, useState } from "react";
import { uploadAsset } from "@/lib/intake/client";
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

export function Uploader({
  scene,
  sceneLabel,
  disabled,
  onReady,
  onError,
}: UploaderProps) {
  const [uploading, setUploading] = useState(false);
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
      onError("Please upload a PNG or JPG image.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      onError("Image must be 50MB or smaller.");
      return;
    }

    setUploading(true);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    const result = await uploadAsset(file);
    setUploading(false);

    if (!result.ok) {
      onError(result.error);
      return;
    }

    onReady(result.assetId, file, objectUrl);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
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
      {/* Upload Dropzone Box matching origin 1:1 */}
      <div
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#dcd6cc] bg-[#fbf9f5] p-8 text-center transition-all hover:border-brand-primary/40 ${
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
              <IconImagePlus className="size-12 text-foreground/45 mb-3" />
              <p className="text-base font-semibold text-foreground">
                Upload a {sceneLabel} photo
              </p>
              <p className="mt-1 text-xs font-semibold text-foreground/85">
                PNG, JPG, JPEG up to 50MB
              </p>
              <p className="mt-0.5 text-xs text-foreground/50">
                A clear, bright photo gives the best result.
              </p>
            </div>

            {/* Sub-divider */}
            <div className="my-6 flex w-full items-center gap-3">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[11px] font-bold tracking-wider uppercase text-foreground/50">
                {scene === "exterior"
                  ? "AI EXTERIOR DESIGN EXAMPLES"
                  : scene === "floor-plan"
                  ? "AI FLOOR PLAN EXAMPLES"
                  : "AI INTERIOR DESIGN EXAMPLES"}
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
          <div className="absolute inset-0 flex items-center justify-center bg-card/85 backdrop-blur-xs rounded-2xl">
            <p className="text-sm font-semibold text-brand-primary animate-pulse">
              Processing image…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
