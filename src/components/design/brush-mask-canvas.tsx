"use client";

import { useEffect, useRef, useState } from "react";

interface BrushMaskCanvasProps {
  imageSrc: string;
  onMaskChange?: (maskDataUrl: string | null) => void;
}

export function BrushMaskCanvas({
  imageSrc,
  onMaskChange,
}: BrushMaskCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
    img.onload = () => {
      canvas.width = img.naturalWidth || 800;
      canvas.height = img.naturalHeight || 600;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [imageSrc]);

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
    setIsDrawing(true);
    setHasDrawn(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(194, 110, 56, 0.65)"; // brand-copper tint
    ctx.lineWidth = brushSize;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (onMaskChange) {
      onMaskChange(canvas.toDataURL("image/png"));
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    if (onMaskChange) {
      onMaskChange(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Instructions & Brush Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-foreground/80">Brush Size:</span>
          <div className="flex items-center gap-1.5">
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
              >
                {sz === 15 ? "Small" : sz === 30 ? "Medium" : "Large"}
              </button>
            ))}
          </div>
        </div>

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

      {/* Interactive Brush Canvas on top of Image */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black/5 select-none touch-none">
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
