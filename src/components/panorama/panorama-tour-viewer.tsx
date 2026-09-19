"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { PanoramaScene, PanoramaHotspot } from "@/lib/panorama/types";
import type { PannellumViewerInstance } from "pannellum/build/pannellum.js";
import "pannellum/build/pannellum.css";

export function isWebGLAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

export interface PanoramaTourViewerProps {
  scenes: PanoramaScene[];
  initialSceneId?: string;
  shareToken?: string;
  onSceneChange?: (sceneId: string) => void;
  onCoordSelect?: (coords: { pitch: number; yaw: number }) => void;
  isPickingCoord?: boolean;
  pickingPrompt?: string;
  previewCoord?: { pitch: number; yaw: number; title?: string } | null;
  className?: string;
  showControls?: boolean;
  showThumbnails?: boolean;
  showVrButton?: boolean;
  showGyroButton?: boolean;
  showFullscreenButton?: boolean;
  autoRotate?: number;
  onHotspotClick?: (hotspot: PanoramaHotspot) => void;
}

export function PanoramaTourViewer({
  scenes,
  initialSceneId,
  shareToken,
  onSceneChange,
  onCoordSelect,
  isPickingCoord = false,
  pickingPrompt,
  previewCoord,
  className = "w-full h-full min-h-[480px]",
  showControls = true,
  showThumbnails = true,
  showVrButton = true,
  showGyroButton = true,
  showFullscreenButton = true,
  autoRotate = 0,
  onHotspotClick,
}: PanoramaTourViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PannellumViewerInstance | null>(null);

  const getSceneImageUrl = useCallback(
    (assetId: string) => {
      if (assetId.startsWith("/") || assetId.startsWith("http://") || assetId.startsWith("https://")) {
        return assetId;
      }
      if (shareToken) {
        return `/api/tours/share/${encodeURIComponent(shareToken)}/assets/${encodeURIComponent(assetId)}`;
      }
      return `/api/assets/${encodeURIComponent(assetId)}/download?inline=1`;
    },
    [shareToken]
  );

  const [useStatic, setUseStatic] = useState(() => !isWebGLAvailable());
  const [activeSceneId, setActiveSceneId] = useState<string>(() => {
    return initialSceneId || scenes[0]?.id || "";
  });
  const [isGyroActive, setIsGyroActive] = useState(false);
  const [gyroSupported, setGyroSupported] = useState(false);
  const [isVrStereo, setIsVrStereo] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeHotspotInfo, setActiveHotspotInfo] = useState<PanoramaHotspot | null>(null);
  const [loadedSceneName, setLoadedSceneName] = useState<string>("");

  // Track drag vs click for pick-coordinate mode
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  const currentScene = scenes.find((s) => s.id === activeSceneId) || scenes[0];

  // Helper to switch scene in viewer
  const handleSceneSelect = useCallback(
    (targetSceneId: string) => {
      if (!targetSceneId || targetSceneId === activeSceneId) return;
      if (viewerRef.current && viewerRef.current.getScene() !== targetSceneId) {
        try {
          viewerRef.current.loadScene(targetSceneId);
        } catch {
          // Fallback if scene is not yet in config
        }
      }
      setActiveSceneId(targetSceneId);
      onSceneChange?.(targetSceneId);
      const s = scenes.find((item) => item.id === targetSceneId);
      if (s) setLoadedSceneName(s.name);
    },
    [activeSceneId, onSceneChange, scenes]
  );

  // Initialize Pannellum Multi-Scene Viewer
  useEffect(() => {
    if (useStatic || !containerRef.current || scenes.length === 0) return;

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

        // Destroy existing viewer before re-initialization
        if (viewerRef.current) {
          try {
            viewerRef.current.destroy();
          } catch {
            // ignore
          }
          viewerRef.current = null;
        }

        const firstId = activeSceneId || scenes[0]?.id;

        // Build scenes config dictionary
        const scenesConfig: Record<string, any> = {};

        for (const scene of scenes) {
          const hotSpots = (scene.hotspots || []).map((hs) => {
            const isPortal = hs.type === "scene";
            return {
              id: hs.id,
              pitch: hs.pitch,
              yaw: hs.yaw,
              type: isPortal ? ("scene" as const) : ("info" as const),
              text: hs.title,
              sceneId: isPortal && hs.targetSceneId ? hs.targetSceneId : undefined,
              cssClass: isPortal ? "obsidian-hotspot-portal" : "obsidian-hotspot-info",
              createTooltipFunc: (hotSpotDiv: HTMLElement) => {
                hotSpotDiv.innerHTML = "";
                const inner = document.createElement("div");
                inner.className = isPortal
                  ? "obsidian-portal-marker"
                  : "obsidian-info-marker";

                const icon = document.createElement("span");
                icon.className = "obsidian-hotspot-icon";
                icon.innerHTML = isPortal
                  ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>`
                  : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

                const label = document.createElement("span");
                label.className = "obsidian-hotspot-label";
                label.innerText = hs.title;

                inner.appendChild(icon);
                inner.appendChild(label);
                hotSpotDiv.appendChild(inner);
              },
              clickHandlerFunc: (_evt: MouseEvent) => {
                onHotspotClick?.(hs);
                if (isPortal && hs.targetSceneId) {
                  handleSceneSelect(hs.targetSceneId);
                } else if (!isPortal) {
                  setActiveHotspotInfo(hs);
                }
              },
            };
          });

          // Add preview hotspot marker if picking coordinate
          if (previewCoord && scene.id === activeSceneId) {
            hotSpots.push({
              id: "preview-pin",
              pitch: previewCoord.pitch,
              yaw: previewCoord.yaw,
              type: "info",
              text: previewCoord.title || "Điểm ghim mới",
              sceneId: undefined,
              cssClass: "obsidian-hotspot-preview-pin",
              createTooltipFunc: (hotSpotDiv: HTMLElement) => {
                hotSpotDiv.innerHTML = "";
                const marker = document.createElement("div");
                marker.className = "obsidian-preview-marker";
                const pinIcon = document.createElement("span");
                pinIcon.className = "obsidian-preview-pin-icon";
                pinIcon.textContent = "📍";
                const label = document.createElement("span");
                label.className = "obsidian-hotspot-label";
                label.textContent = previewCoord.title || "Tọa độ đã chọn";
                marker.appendChild(pinIcon);
                marker.appendChild(label);
                hotSpotDiv.appendChild(marker);
              },
              clickHandlerFunc: () => {},
            });
          }

          scenesConfig[scene.id] = {
            title: scene.name,
            type: "equirectangular",
            panorama: getSceneImageUrl(scene.assetId),
            yaw: scene.initialYaw || 0,
            pitch: scene.initialPitch || 0,
            hfov: scene.initialHfov || 100,
            autoLoad: true,
            autoRotate: autoRotate,
            hotSpots,
          };
        }

        const pannel = (window as unknown as { pannellum?: import("pannellum/build/pannellum.js").PannellumGlobal }).pannellum;
        if (!pannel?.viewer) {
          setUseStatic(true);
          return;
        }

        const viewer = pannel.viewer(containerRef.current, {
          default: {
            firstScene: firstId,
            sceneFadeDuration: 800,
            autoLoad: true,
            showControls: false,
            showFullscreenCtrl: false,
            showZoomCtrl: false,
            compass: false,
            autoRotate: autoRotate,
          },
          scenes: scenesConfig,
        }) as PannellumViewerInstance;

        viewerRef.current = viewer;

        // Listen for WebGL context loss to prevent crash and trigger smooth static fallback
        const canvas = containerRef.current?.querySelector("canvas");
        const handleContextLost = (e: Event) => {
          e.preventDefault();
          setUseStatic(true);
        };
        canvas?.addEventListener("webglcontextlost", handleContextLost);

        viewer.on("load", () => {
          const curId = viewer.getScene() || firstId;
          setActiveSceneId(curId);
          const activeItem = scenes.find((s) => s.id === curId);
          if (activeItem) setLoadedSceneName(activeItem.name);
          if (viewer.isOrientationSupported) {
            setGyroSupported(viewer.isOrientationSupported());
          }
        });

        viewer.on("scenechange", (sceneId: unknown) => {
          if (typeof sceneId === "string") {
            setActiveSceneId(sceneId);
            onSceneChange?.(sceneId);
            const activeItem = scenes.find((s) => s.id === sceneId);
            if (activeItem) setLoadedSceneName(activeItem.name);
          }
        });

        viewer.on("error", () => {
          setUseStatic(true);
        });
      } catch {
        setUseStatic(true);
      }
    })();

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
        } catch {
          // ignore
        }
        viewerRef.current = null;
      }
    };
  }, [scenes, useStatic, autoRotate, previewCoord, handleSceneSelect, onHotspotClick, onSceneChange, activeSceneId, getSceneImageUrl]);

  // Handle pointer events for Click-to-Coordinate (distinguishing drag vs click)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPickingCoord) return;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPickingCoord || !dragStartPos.current || !viewerRef.current) return;
    const dx = Math.abs(e.clientX - dragStartPos.current.x);
    const dy = Math.abs(e.clientY - dragStartPos.current.y);
    dragStartPos.current = null;

    // Movement threshold to ensure it was a click, not a panning drag
    if (dx < 6 && dy < 6) {
      try {
        const coords = viewerRef.current.mouseEventToCoords(e.nativeEvent);
        if (Array.isArray(coords) && coords.length === 2) {
          const pitch = Number(coords[0].toFixed(1));
          const yaw = Number(coords[1].toFixed(1));
          onCoordSelect?.({ pitch, yaw });
        }
      } catch {
        // Pannellum not yet ready for coords
      }
    }
  };

  // Gyroscope toggle with iOS permission handling
  const toggleGyroscope = async () => {
    if (!viewerRef.current) return;

    if (isGyroActive) {
      viewerRef.current.stopOrientation();
      setIsGyroActive(false);
      return;
    }

    try {
      const Doe = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
      if (typeof Doe?.requestPermission === "function") {
        const permission = await Doe.requestPermission();
        if (permission !== "granted") {
          alert("Quyền truy cập con quay hồi chuyển bị từ chối.");
          return;
        }
      }

      viewerRef.current.startOrientation();
      setIsGyroActive(true);
    } catch {
      alert("Thiết bị hoặc trình duyệt không hỗ trợ con quay hồi chuyển (Gyroscope).");
    }
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Auto-resize viewer on window resize, device orientation change, or container resize
  useEffect(() => {
    const handleResize = () => {
      if (viewerRef.current) {
        try {
          viewerRef.current.resize();
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    const observer =
      typeof ResizeObserver !== "undefined" && containerRef.current
        ? new ResizeObserver(() => handleResize())
        : null;

    if (observer && containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      observer?.disconnect();
    };
  }, []);

  // Static fallback when WebGL unavailable
  if (useStatic || scenes.length === 0) {
    const fallbackUrl = currentScene ? getSceneImageUrl(currentScene.assetId) : "";

    return (
      <div
        data-testid="panorama-static-fallback"
        className={`relative overflow-hidden rounded-2xl border border-border/80 bg-black ${className}`}
      >
        {fallbackUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fallbackUrl}
            alt={currentScene?.name || "Room panorama preview"}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full min-h-[360px] items-center justify-center text-foreground/50">
            Chưa có căn phòng 360 nào trong Tour này.
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 text-white">
          <p className="text-xs font-semibold text-brand-gold">
            {currentScene?.name || "Chế độ xem tĩnh"}
          </p>
          <p className="mt-0.5 text-[11px] text-foreground/60">
            Trình duyệt không hỗ trợ WebGL hoặc không có card đồ họa tăng tốc. Đang hiển thị ảnh tĩnh Equirectangular.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      data-testid="panorama-tour-wrapper"
      className={`group relative select-none overflow-hidden rounded-2xl bg-neutral-950 font-sans text-white ${className} ${
        isVrStereo ? "obsidian-vr-stereo" : ""
      }`}
    >
      {/* 1. Main 360 Viewer Canvas */}
      <div
        ref={containerRef}
        data-testid="panorama-viewer-container"
        className={`h-full w-full ${isPickingCoord ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      />

      {/* VR Stereo Side-by-Side Duplication Overlay */}
      {isVrStereo && (
        <div className="pointer-events-none absolute inset-0 z-10 flex">
          <div className="relative h-full w-1/2 border-r border-white/20">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-gold/60 p-1 text-[10px] text-brand-gold">
              +
            </div>
          </div>
          <div className="relative h-full w-1/2">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-gold/60 p-1 text-[10px] text-brand-gold">
              +
            </div>
          </div>
        </div>
      )}

      {/* 2. Top-Left Scene Information & Status Badge */}
      <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-col gap-1">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3.5 py-1.5 backdrop-blur-md">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-gold opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-brand-gold" />
          </span>
          <span className="text-xs font-bold tracking-wide text-white">
            {loadedSceneName || currentScene?.name || "360° VR Space"}
          </span>
          <span className="text-[10px] font-semibold text-brand-gold/80">
            ({scenes.findIndex((s) => s.id === activeSceneId) + 1}/{scenes.length})
          </span>
        </div>

        {isPickingCoord && (
          <div className="pointer-events-auto mt-1 inline-flex items-center gap-2 rounded-xl border border-brand-gold/40 bg-black/80 px-3 py-1.5 text-xs text-brand-gold backdrop-blur-md shadow-lg">
            <span>🎯</span>
            <span className="font-semibold">
              {pickingPrompt || "Click lên vị trí mong muốn trên ảnh 360 để lấy tọa độ ghim"}
            </span>
          </div>
        )}
      </div>

      {/* 3. Top-Right Floating Controls (Gyro, VR, Fullscreen) */}
      {showControls && (
        <div className="pointer-events-auto absolute right-4 top-4 z-20 flex items-center gap-2">
          {/* Gyroscope Button */}
          {showGyroButton && (
            <button
              type="button"
              onClick={toggleGyroscope}
              title={isGyroActive ? "Tắt Gyroscope (Cảm biến xoay)" : "Bật Gyroscope (Xoay điện thoại để nhìn)"}
              className={`flex size-10 items-center justify-center rounded-full border backdrop-blur-md transition ${
                isGyroActive
                  ? "border-brand-gold bg-brand-gold text-black shadow-[0_0_15px_rgba(212,175,55,0.4)]"
                  : "border-white/15 bg-black/60 text-white hover:border-brand-gold/50 hover:bg-black/80"
              }`}
            >
              <svg className="size-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v4m0 12v4M2 12h4m12 0h4m-3.172-6.828l-2.828 2.828M7.757 16.243l-2.828 2.828m0-14.142l2.828 2.828m8.486 8.486l2.828 2.828" />
              </svg>
            </button>
          )}

          {/* VR Cardboard Stereo Button */}
          {showVrButton && (
            <button
              type="button"
              onClick={() => setIsVrStereo((prev) => !prev)}
              title={isVrStereo ? "Thoát chế độ kính VR" : "Chế độ kính VR Cardboard (Chia đôi màn hình)"}
              className={`flex size-10 items-center justify-center rounded-full border backdrop-blur-md transition ${
                isVrStereo
                  ? "border-brand-gold bg-brand-gold text-black shadow-[0_0_15px_rgba(212,175,55,0.4)]"
                  : "border-white/15 bg-black/60 text-white hover:border-brand-gold/50 hover:bg-black/80"
              }`}
            >
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a3 3 0 01-3 3h-2.5a1.5 1.5 0 01-1.2-.6L12 16l-1.3 1.4a1.5 1.5 0 01-1.2.6H7a3 3 0 01-3-3V6zM7 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm10 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
              </svg>
            </button>
          )}

          {/* Fullscreen Button */}
          {showFullscreenButton && (
            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Thu nhỏ màn hình" : "Xem toàn màn hình"}
              className="flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white backdrop-blur-md transition hover:border-brand-gold/50 hover:bg-black/80"
            >
              {isFullscreen ? (
                <svg className="size-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="size-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              )}
            </button>
          )}
        </div>
      )}

      {/* 4. Bottom Floating Scene Carousel (Thumbnails) */}
      {showThumbnails && scenes.length > 1 && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
          <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-black/70 p-2 backdrop-blur-md shadow-2xl">
            {scenes.map((scene, idx) => {
              const isActive = scene.id === activeSceneId;
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => handleSceneSelect(scene.id)}
                  className={`group relative flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 transition ${
                    isActive
                      ? "border-brand-gold bg-brand-gold/20 text-brand-gold shadow-[0_0_12px_rgba(212,175,55,0.3)]"
                      : "border-white/10 bg-white/5 text-white/70 hover:border-white/30 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <div className="relative size-7 overflow-hidden rounded-lg border border-white/20 bg-neutral-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getSceneImageUrl(scene.assetId)}
                      alt={scene.name}
                      className="h-full w-full object-cover transition group-hover:scale-110"
                    />
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] font-bold leading-tight line-clamp-1">{scene.name}</p>
                    <p className="text-[9px] text-white/50">Phòng {idx + 1}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Info Hotspot Modal / Bottom Sheet Popup */}
      {activeHotspotInfo && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative max-w-md rounded-2xl border border-brand-gold/40 bg-neutral-900/95 p-6 text-white shadow-2xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => setActiveHotspotInfo(null)}
              className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
            <div className="flex items-center gap-2 text-brand-gold">
              <span className="text-lg">ℹ️</span>
              <h4 className="text-sm font-bold uppercase tracking-wider">Thông Tin Kiến Trúc</h4>
            </div>
            <h3 className="mt-2 text-lg font-extrabold text-white">{activeHotspotInfo.title}</h3>
            {activeHotspotInfo.description ? (
              <p className="mt-2 text-xs leading-relaxed text-neutral-300">
                {activeHotspotInfo.description}
              </p>
            ) : (
              <p className="mt-2 text-xs italic text-neutral-500">Không có ghi chú mô tả thêm.</p>
            )}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveHotspotInfo(null)}
                className="rounded-xl bg-brand-gold px-4 py-2 text-xs font-bold text-black transition hover:bg-brand-gold/90"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Custom CSS for Hotspots (Inlined for zero-dependency elegance) */}
      <style jsx global>{`
        /* Obsidian Gold Portal Hotspot */
        .obsidian-hotspot-portal {
          cursor: pointer !important;
          pointer-events: auto !important;
        }
        .obsidian-portal-marker {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(9, 13, 19, 0.85);
          border: 1.5px solid #d4af37;
          box-shadow: 0 0 15px rgba(212, 175, 55, 0.5), inset 0 0 8px rgba(212, 175, 55, 0.3);
          padding: 6px 10px;
          border-radius: 9999px;
          backdrop-filter: blur(8px);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          transform: translate(-50%, -50%);
          animation: obsidianPulse 2.5s infinite;
        }
        .obsidian-portal-marker:hover {
          transform: translate(-50%, -50%) scale(1.1);
          background: rgba(212, 175, 55, 0.95);
          color: #090d13;
          border-color: #ffffff;
        }
        .obsidian-portal-marker:hover .obsidian-hotspot-label {
          color: #090d13;
        }

        /* Obsidian Gold Info Hotspot */
        .obsidian-hotspot-info {
          cursor: pointer !important;
          pointer-events: auto !important;
        }
        .obsidian-info-marker {
          display: flex;
          align-items: center;
          gap: 5px;
          background: rgba(20, 24, 33, 0.9);
          border: 1.5px solid rgba(212, 175, 55, 0.7);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          padding: 5px 8px;
          border-radius: 9999px;
          backdrop-filter: blur(6px);
          transform: translate(-50%, -50%);
          transition: all 0.2s ease;
        }
        .obsidian-info-marker:hover {
          transform: translate(-50%, -50%) scale(1.08);
          border-color: #dfba73;
        }

        /* Preview Coordinate Pin Hotspot */
        .obsidian-hotspot-preview-pin {
          pointer-events: none !important;
        }
        .obsidian-preview-marker {
          display: flex;
          align-items: center;
          gap: 4px;
          background: #d4af37;
          color: #000;
          font-weight: bold;
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 8px;
          box-shadow: 0 0 20px rgba(212, 175, 55, 0.8);
          transform: translate(-50%, -100%);
          animation: bounce 1s infinite alternate;
        }

        .obsidian-hotspot-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #d4af37;
        }
        .obsidian-portal-marker:hover .obsidian-hotspot-icon {
          color: #090d13;
        }
        .obsidian-hotspot-label {
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
          color: #ffffff;
          letter-spacing: 0.02em;
        }

        @keyframes obsidianPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.7);
          }
          70% {
            box-shadow: 0 0 0 12px rgba(212, 175, 55, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(212, 175, 55, 0);
          }
        }

        @keyframes bounce {
          0% {
            transform: translate(-50%, -100%);
          }
          100% {
            transform: translate(-50%, -120%);
          }
        }
      `}</style>
    </div>
  );
}
