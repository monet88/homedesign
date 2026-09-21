"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface BrushMaskCanvasProps {
  imageSrc: string;
  onMaskChange?: (maskDataUrl: string | null) => void;
}

export function BrushMaskCanvas({
  imageSrc,
  onMaskChange,
}: BrushMaskCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const historyStepRef = useRef<number>(-1);
  const isDrawingRef = useRef(false);

  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  const saveHistorySnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof ctx.getImageData !== "function") return;

    try {
      // Ensure initial blank state exists in history before saving new stroke
      if (historyRef.current.length === 0) {
        const blank = ctx.getImageData(0, 0, canvas.width, canvas.height);
        historyRef.current = [blank];
        historyStepRef.current = 0;
      }

      const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const nextHistory = historyRef.current.slice(0, historyStepRef.current + 1);
      nextHistory.push(snapshot);
      // Cap history at 25 states to prevent memory leaks
      if (nextHistory.length > 25) {
        nextHistory.shift();
      }
      historyRef.current = nextHistory;
      historyStepRef.current = nextHistory.length - 1;
      setCanUndo(historyStepRef.current > 0);
      setCanRedo(false);
    } catch {
      // Ignore canvas security or mock limitations
    }
  }, []);

  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx || historyStepRef.current <= 0) return;

    historyStepRef.current -= 1;
    const snapshot = historyRef.current[historyStepRef.current];
    if (snapshot && typeof ctx.putImageData === "function") {
      ctx.putImageData(snapshot, 0, 0);
    }
    setCanUndo(historyStepRef.current > 0);
    setCanRedo(historyStepRef.current < historyRef.current.length - 1);

    if (historyStepRef.current === 0) {
      setHasDrawn(false);
      onMaskChange?.(null);
    } else {
      setHasDrawn(true);
      onMaskChange?.(canvas.toDataURL("image/png"));
    }
  }, [onMaskChange]);

  const handleRedo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx || historyStepRef.current >= historyRef.current.length - 1) return;

    historyStepRef.current += 1;
    const snapshot = historyRef.current[historyStepRef.current];
    if (snapshot && typeof ctx.putImageData === "function") {
      ctx.putImageData(snapshot, 0, 0);
    }
    setCanUndo(historyStepRef.current > 0);
    setCanRedo(historyStepRef.current < historyRef.current.length - 1);
    setHasDrawn(true);
    onMaskChange?.(canvas.toDataURL("image/png"));
  }, [onMaskChange]);

  const decreaseBrush = useCallback(() => {
    setBrushSize((prev) => {
      if (prev > 30) return 30;
      if (prev > 15) return 15;
      return 15;
    });
  }, []);

  const increaseBrush = useCallback(() => {
    setBrushSize((prev) => {
      if (prev < 30) return 30;
      if (prev < 50) return 50;
      return 50;
    });
  }, []);

  // Keyboard Shortcuts: [ / ] for brush size, Ctrl+Z / Cmd+Z for undo, Ctrl+Shift+Z / Ctrl+Y for redo, Esc to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "[") {
        e.preventDefault();
        decreaseBrush();
      } else if (e.key === "]") {
        e.preventDefault();
        increaseBrush();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === "Escape") {
        if (isDrawingRef.current) {
          isDrawingRef.current = false;
          setIsDrawing(false);
          lastPosRef.current = null;
          handleUndo();
        }
      }
    };

    const handleBlur = () => {
      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        setIsDrawing(false);
        lastPosRef.current = null;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
    };
  }, [decreaseBrush, increaseBrush, handleUndo, handleRedo]);

  useEffect(() => {
    setHasDrawn(false);
    onMaskChange?.(null);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
    img.onload = () => {
      const width = img.naturalWidth || 800;
      const height = img.naturalHeight || 600;
      canvas.width = width;
      canvas.height = height;
      setAspectRatio(width / height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (typeof ctx.getImageData === "function") {
        try {
          const blankSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
          historyRef.current = [blankSnapshot];
          historyStepRef.current = 0;
          setCanUndo(false);
          setCanRedo(false);
          setHasDrawn(false);
          onMaskChange?.(null);
        } catch {
          // ignore
        }
      }
    };
  }, [imageSrc, onMaskChange]);

  const getCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    isDrawingRef.current = true;
    setIsDrawing(true);
    setHasDrawn(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    lastPosRef.current = { x, y };

    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(194, 110, 56, 0.65)"; // brand-copper tint
    ctx.fill();
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    if (!lastPosRef.current) {
      lastPosRef.current = { x, y };
      return;
    }

    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(x, y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(194, 110, 56, 0.65)";
    ctx.lineWidth = brushSize;
    ctx.stroke();

    lastPosRef.current = { x, y };
  };

  const stopDrawing = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    setIsDrawing(false);
    lastPosRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    saveHistorySnapshot();
    if (onMaskChange) {
      onMaskChange(canvas.toDataURL("image/png"));
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    lastPosRef.current = null;
    setHasDrawn(false);
    saveHistorySnapshot();
    if (onMaskChange) {
      onMaskChange(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Instructions & Brush Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground/80">Brush:</span>
            {[15, 30, 50].map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setBrushSize(sz)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  brushSize === sz
                    ? "bg-brand-primary text-brand-ivory"
                    : "border border-border bg-background text-foreground/70 hover:text-foreground"
                }`}
                title={`Brush size ${sz}px (Use [ or ] to change)`}
              >
                {sz === 15 ? "Small" : sz === 30 ? "Medium" : "Large"}
              </button>
            ))}
          </div>

          <div className="hidden sm:flex items-center text-[10px] text-foreground/50 font-mono">
            Phím tắt: [ nhỏ / ] to
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            aria-label="Undo mask stroke"
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground/80 hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
            title="Hoàn tác nét vẽ (Ctrl + Z)"
          >
            <span>↶</span>
            <span className="hidden sm:inline">Undo</span>
          </button>

          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            aria-label="Redo mask stroke"
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground/80 hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
            title="Làm lại nét vẽ (Ctrl + Y)"
          >
            <span>↷</span>
            <span className="hidden sm:inline">Redo</span>
          </button>

          {hasDrawn && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >
              Clear Mask
            </button>
          )}
        </div>
      </div>

      {/* Interactive Brush Canvas on top of Image */}
      <div
        style={{
          aspectRatio: aspectRatio ? `${aspectRatio}` : "16/9",
          maxWidth: aspectRatio ? `min(100%, calc(600px * ${aspectRatio}))` : "100%",
        }}
        className="relative w-full max-h-[600px] mx-auto overflow-hidden rounded-2xl border border-border bg-black/5 select-none touch-none"
      >
        <img
          src={imageSrc}
          alt="Source to edit"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="absolute inset-0 h-full w-full cursor-crosshair"
        />
        {!hasDrawn && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="rounded-full bg-card/90 px-4 py-2 text-xs font-semibold text-foreground shadow-md backdrop-blur-xs">
              Brush over the area you want to replace (e.g. sofa, wall, floor)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
