"use client";

import { useEffect, useRef, useState } from "react";
import type { PanoramaOrientationView } from "@/lib/floor-plan/types";
import "pannellum/build/pannellum.css";

type PannellumViewer = {
  destroy: () => void;
  on?: (event: string, listener: () => void) => void;
};

declare global {
  interface Window {
    pannellum?: {
      viewer: (container: HTMLElement, config: Record<string, unknown>) => PannellumViewer;
    };
  }
}

/** Exported for unit tests — WebGL probe used before mounting Pannellum. */
export function isWebGLAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

export interface PanoramaViewerProps {
  assetId: string;
  orientation?: PanoramaOrientationView | null;
  alt?: string;
}

export function PanoramaViewer({
  assetId,
  orientation,
  alt = "Room panorama",
}: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PannellumViewer | null>(null);
  const [useStatic, setUseStatic] = useState(() => !isWebGLAvailable());
  const panoramaUrl = `/api/assets/${assetId}/download`;

  useEffect(() => {
    if (useStatic || !containerRef.current) return;

    let cancelled = false;

    void (async () => {
      try {
        await import("pannellum/build/pannellum.js");
        if (cancelled || !containerRef.current) return;

        const { pannellum } = window;
        if (!pannellum?.viewer) {
          setUseStatic(true);
          return;
        }

        viewerRef.current = pannellum.viewer(containerRef.current, {
          type: "equirectangular",
          panorama: panoramaUrl,
          yaw: orientation?.yaw ?? 0,
          pitch: orientation?.pitch ?? 0,
          hfov: orientation?.hfov ?? 100,
          showControls: true,
          autoLoad: true,
        });

        viewerRef.current.on?.("error", () => setUseStatic(true));
      } catch {
        setUseStatic(true);
      }
    })();

    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [assetId, orientation, panoramaUrl, useStatic]);

  if (useStatic) {
    return (
      <div
        data-testid="panorama-static-fallback"
        className="overflow-hidden rounded-xl border border-neutral-200 bg-white"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={panoramaUrl} alt={alt} className="block w-full" />
        <p className="bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          Interactive 360° view unavailable — showing static panorama preview.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="panorama-viewer"
      className="h-[min(60vh,480px)] overflow-hidden rounded-xl border border-neutral-200 bg-neutral-900"
      aria-label="Interactive room panorama"
    />
  );
}
