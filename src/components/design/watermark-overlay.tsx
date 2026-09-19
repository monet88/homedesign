"use client";

import React, { useState, useEffect } from "react";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import type { StudioBranding } from "@/lib/branding/types";

interface WatermarkOverlayProps {
  className?: string;
}

export function WatermarkOverlay({ className = "" }: WatermarkOverlayProps) {
  const { activeWorkspace } = useWorkspace();
  const [branding, setBranding] = useState<StudioBranding | null>(null);

  useEffect(() => {
    if (!activeWorkspace?.id) {
      setBranding(null);
      return;
    }

    fetch(`/api/workspaces/${activeWorkspace.id}/branding`)
      .then((r) => r.json())
      .then((json: any) => {
        if (json.code === 0 && json.data?.branding) {
          setBranding(json.data.branding);
        }
      })
      .catch(() => {});
  }, [activeWorkspace?.id]);

  if (!branding || !branding.watermarkEnabled) {
    return null;
  }

  const opacity = branding.watermarkOpacity ?? 0.4;
  const position = branding.watermarkPosition || "bottom-right";

  return (
    <div
      className={`pointer-events-none absolute inset-0 select-none z-20 flex p-4 ${
        position === "bottom-right"
          ? "items-end justify-end text-right"
          : position === "bottom-left"
          ? "items-end justify-start text-left"
          : "items-center justify-center text-center"
      } ${className}`}
    >
      <div
        className="max-w-xs font-black tracking-widest text-[11px] sm:text-xs uppercase drop-shadow-md"
        style={{
          color: `rgba(255, 255, 255, ${opacity})`,
          textShadow: "0 1px 4px rgba(0, 0, 0, 0.8)",
        }}
      >
        {branding.brandLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.brandLogoUrl}
            alt="Logo Watermark"
            className="h-5 mb-1 inline-block object-contain"
            style={{ opacity }}
          />
        )}
        <div>{branding.watermarkText || `© ${branding.brandName || "STUDIO"} • BẢN QUYỀN THIẾT KẾ`}</div>
      </div>
    </div>
  );
}
