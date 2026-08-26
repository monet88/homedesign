"use client";

import { useRef, useState } from "react";
import { uploadAsset } from "@/lib/intake/client";

// Upload dropzone for the design-flow pages (ticket #14).
// Handles PNG/JPG/JPEG up to 50MB, calls the authenticated intake pipeline,
// and reports the ready source asset id to the parent form.

const VALID_TYPES = ["image/png", "image/jpeg", "image/jpg"];
const MAX_SIZE_BYTES = 50 * 1024 * 1024;

interface UploaderProps {
  sceneLabel: string;
  disabled?: boolean;
  onReady: (assetId: string, file: File) => void;
  onError: (message: string) => void;
}

export function Uploader({ sceneLabel, disabled, onReady, onError }: UploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!VALID_TYPES.includes(file.type)) {
      onError("Please upload a PNG or JPG image.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      onError("Image must be 50MB or smaller.");
      return;
    }

    setUploading(true);
    setPreviewUrl(URL.createObjectURL(file));

    const result = await uploadAsset(file);

    setUploading(false);

    if (!result.ok) {
      onError(result.error);
      return;
    }

    onReady(result.assetId, file);
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

  return (
    <div className="space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className={
          "cursor-pointer rounded-card border-2 border-dashed border-ink/20 bg-paper p-8 text-center transition-colors hover:border-ink/40" +
          (disabled ? " opacity-50" : "")
        }
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          onChange={handleChange}
          disabled={disabled || uploading}
          className="sr-only"
          aria-label={`Upload a ${sceneLabel} photo`}
        />

        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Upload preview"
            className="mx-auto aspect-video max-h-48 rounded-card object-cover"
          />
        ) : (
          <>
            <p className="text-sm font-medium text-ink">
              Upload a {sceneLabel} photo
            </p>
            <p className="mt-1 text-xs text-ink/60">
              PNG, JPG, JPEG up to 50MB
            </p>
          </>
        )}

        {uploading && (
          <p className="mt-2 text-xs text-ink/60">Uploading…</p>
        )}
      </div>
    </div>
  );
}
