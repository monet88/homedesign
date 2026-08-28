"use client";

import {
  ASPECT_RATIO_OPTIONS,
  DESIGN_MODES,
  EXTERIOR_AREAS,
  EXTERIOR_PALETTES,
  EXTERIOR_STYLES,
  INTERIOR_PALETTES,
  INTERIOR_ROOM_TYPES,
  INTERIOR_STYLES,
} from "@/lib/design/options";
import {
  applyPreset,
  buildDesignConfig,
  initialDesignFormState,
  type DesignFormState,
  type DesignPreset,
} from "@/lib/design/state";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { BrushMaskCanvas } from "./brush-mask-canvas";
import {
  IconSparkles,
  IconHome,
  IconWand,
  IconPalette,
  IconCrop,
  IconDocument,
  IconChevronDown,
} from "@/components/shell/icons";

const MAX_REQUIREMENTS = 300;

interface DesignFormProps {
  scene: "interior" | "exterior";
  sourceAssetId: string | null;
  sourcePreviewUrl?: string | null;
  initialPreset?: DesignPreset;
  disabled?: boolean;
  onGenerate: (body: Record<string, unknown>, sourceAssetId: string) => void;
  onToast: (message: string, variant?: "error") => void;
}

export interface DesignFormHandle {
  generate: () => void;
}

const COLOR_PALETTES = [
  {
    name: "Neutral",
    colors: ["#e5e0d8", "#baa898", "#4a453e"],
  },
  {
    name: "Warm",
    colors: ["#f59e0b", "#ea580c", "#78350f"],
  },
  {
    name: "Cool",
    colors: ["#60a5fa", "#2563eb", "#1e3a8a"],
  },
  {
    name: "Earth",
    colors: ["#eab308", "#ca8a04", "#14532d"],
  },
];

const ASPECT_RATIOS = [
  { label: "1:1", w: "w-4", h: "h-4" },
  { label: "4:3", w: "w-5", h: "h-3.5" },
  { label: "16:9", w: "w-5", h: "h-2.5" },
  { label: "3:4", w: "w-3.5", h: "h-5" },
  { label: "9:16", w: "w-2.5", h: "h-5" },
];

export const DesignForm = forwardRef<DesignFormHandle, DesignFormProps>(
  function DesignForm(
    {
      scene,
      sourceAssetId,
      sourcePreviewUrl,
      initialPreset,
      disabled,
      onGenerate,
      onToast,
    }: DesignFormProps,
    ref
  ) {
    const [state, setState] = useState<DesignFormState>(() => {
      const initial = initialDesignFormState(scene);
      return initialPreset ? applyPreset(initial, initialPreset) : initial;
    });

    const [isCustomMode, setIsCustomMode] = useState(false);
    const [model, setModel] = useState("nano-banana");

    useEffect(() => {
      if (initialPreset) {
        setState((prev) => applyPreset(prev, initialPreset));
      }
    }, [initialPreset]);

    const isCustomStyle = state.style === "Custom";
    const isCustomRoom = state.roomType === "Custom";
    const isCustomArea = state.area === "Custom";

    const roomOptions =
      scene === "interior"
        ? [...INTERIOR_ROOM_TYPES, "Custom"]
        : [...EXTERIOR_AREAS, "Custom"];
    const styleOptions =
      scene === "interior"
        ? [...INTERIOR_STYLES, "Custom"]
        : [...EXTERIOR_STYLES, "Custom"];

    function update<K extends keyof DesignFormState>(
      key: K,
      value: DesignFormState[K]
    ) {
      setState((prev) => ({ ...prev, [key]: value }));
    }

    function handleGenerate() {
      if (!sourceAssetId) {
        onToast("Please upload a photo before generating.", "error");
        return;
      }
      onGenerate(
        buildDesignConfig(scene, state, sourceAssetId),
        sourceAssetId
      );
    }

    useImperativeHandle(ref, () => ({
      generate: handleGenerate,
    }));

    return (
      <div className="flex flex-col gap-5">
        {/* 1. Mode Switcher (Full Redesign / Local Edit) */}
        <div className="flex rounded-xl border border-border/80 bg-background/50 p-1">
          {DESIGN_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => update("mode", m.value)}
              aria-pressed={state.mode === m.value}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                state.mode === m.value
                  ? "bg-brand-primary text-white shadow-xs"
                  : "text-foreground/70 hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Local Edit Brush Canvas (if Local Edit mode is active and source is uploaded) */}
        {state.mode === "edit" && sourcePreviewUrl && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <h4 className="mb-2 text-xs font-semibold text-foreground">
              Brush Inpainting Mask
            </h4>
            <BrushMaskCanvas imageSrc={sourcePreviewUrl} />
          </div>
        )}

        {/* 2. Model Section */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <IconSparkles className="size-3.5 text-foreground/70" />
            <label className="text-xs font-semibold text-foreground">
              Model
            </label>
          </div>
          <div className="relative">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={disabled}
              aria-label="Select AI Model"
              className="w-full appearance-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-medium text-foreground outline-none transition-colors focus:border-brand-primary"
            >
              <option value="nano-banana">Nano Banana</option>
              <option value="nano-banana-2">Nano Banana 2</option>
              <option value="nano-banana-pro">Nano Banana Pro</option>
            </select>
            <IconChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 size-3.5 text-foreground/50" />
          </div>
        </div>

        {/* 3. Room Type / Exterior Area Section */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <IconHome className="size-3.5 text-foreground/70" />
            <label
              htmlFor="room-area-select"
              className="text-xs font-semibold text-foreground"
            >
              {scene === "interior" ? "Room Type" : "Area"}
            </label>
          </div>
          <div className="relative">
            <select
              id="room-area-select"
              value={scene === "interior" ? state.roomType : state.area}
              onChange={(e) =>
                update(
                  scene === "interior" ? "roomType" : "area",
                  e.target.value
                )
              }
              disabled={disabled || state.mode === "edit"}
              className="w-full appearance-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-medium text-foreground outline-none transition-colors focus:border-brand-primary disabled:opacity-50"
            >
              {roomOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <IconChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 size-3.5 text-foreground/50" />
          </div>
          {isCustomRoom && scene === "interior" && (
            <input
              type="text"
              value={state.customRoomType}
              onChange={(e) => update("customRoomType", e.target.value)}
              placeholder="e.g. reading nook, home gym"
              className="mt-2 block w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-brand-primary focus:outline-none"
            />
          )}
          {isCustomArea && scene === "exterior" && (
            <input
              type="text"
              value={state.customArea}
              onChange={(e) => update("customArea", e.target.value)}
              placeholder="e.g. side garden, rooftop terrace"
              className="mt-2 block w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-brand-primary focus:outline-none"
            />
          )}
        </div>

        {/* 4. Design Style Section */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <IconWand className="size-3.5 text-foreground/70" />
            <label className="text-xs font-semibold text-foreground">
              {scene === "interior" ? "Design Style" : "Exterior Style"}
            </label>
          </div>
          <div className="relative">
            <select
              value={state.style}
              onChange={(e) => update("style", e.target.value)}
              disabled={disabled || state.mode === "edit"}
              aria-label="Select Style"
              className="w-full appearance-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-medium text-foreground outline-none transition-colors focus:border-brand-primary disabled:opacity-50"
            >
              {styleOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <IconChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 size-3.5 text-foreground/50" />
          </div>
          {isCustomStyle && (
            <input
              type="text"
              value={state.customStyle}
              onChange={(e) => update("customStyle", e.target.value)}
              placeholder="e.g. rustic coastal, art deco"
              className="mt-2 block w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-brand-primary focus:outline-none"
            />
          )}
        </div>

        {/* 5. Color Scheme Section */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <IconPalette className="size-3.5 text-foreground/70" />
            <label className="text-xs font-semibold text-foreground">
              Color Scheme
            </label>
          </div>

          {/* 4 Palette Cards */}
          <div className="grid grid-cols-4 gap-2">
            {COLOR_PALETTES.map((pal) => {
              const isSelected = !isCustomMode && state.colorScheme === pal.name;
              return (
                <button
                  key={pal.name}
                  type="button"
                  onClick={() => {
                    setIsCustomMode(false);
                    update("colorScheme", pal.name);
                  }}
                  aria-pressed={isSelected}
                  disabled={disabled || state.mode === "edit"}
                  className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition-all ${
                    isSelected
                      ? "border-brand-primary bg-brand-primary/5 shadow-xs ring-1 ring-brand-primary"
                      : "border-border bg-card hover:bg-black/5"
                  }`}
                >
                  <div className="flex items-center gap-1 mb-1">
                    {pal.colors.map((c, idx) => (
                      <span
                        key={idx}
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-medium text-foreground/80">
                    {pal.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom Palette Row */}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsCustomMode(true);
                update("colorScheme", "Custom");
              }}
              aria-pressed={isCustomMode || state.colorScheme === "Custom"}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-center text-[11px] font-medium transition-all ${
                isCustomMode || state.colorScheme === "Custom"
                  ? "border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary"
                  : "border-border bg-card hover:bg-black/5"
              }`}
            >
              <IconPalette className="size-3.5 text-foreground/70" />
              <span>Custom</span>
            </button>
            <input
              type="text"
              value={state.customColorScheme}
              onChange={(e) => {
                setIsCustomMode(true);
                update("colorScheme", "Custom");
                update("customColorScheme", e.target.value);
              }}
              placeholder="e.g. navy blue and brass..."
              className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-foreground/40 focus:border-brand-primary focus:outline-none"
            />
          </div>
        </div>

        {/* 6. Aspect Ratio Section */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <IconCrop className="size-3.5 text-foreground/70" />
            <label className="text-xs font-semibold text-foreground">
              Aspect Ratio
            </label>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {ASPECT_RATIOS.map((ratio) => {
              const isSelected = state.aspectRatio === ratio.label;
              return (
                <button
                  key={ratio.label}
                  type="button"
                  onClick={() => update("aspectRatio", ratio.label)}
                  aria-pressed={isSelected}
                  disabled={disabled}
                  className={`flex flex-col items-center justify-center rounded-xl border py-2 px-1 text-center transition-all ${
                    isSelected
                      ? "border-brand-primary bg-brand-primary text-white shadow-xs"
                      : "border-border bg-card text-foreground/80 hover:bg-black/5"
                  }`}
                >
                  <div className="flex h-5 items-center justify-center mb-1">
                    <span
                      className={`rounded-xs border ${
                        isSelected ? "border-white bg-white/40" : "border-foreground/40 bg-foreground/10"
                      } ${ratio.w} ${ratio.h}`}
                    />
                  </div>
                  <span className="text-[10px] font-semibold">{ratio.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 7. Custom Requirements Section */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <IconDocument className="size-3.5 text-foreground/70" />
              <label
                htmlFor="custom-req-input"
                className="text-xs font-semibold text-foreground"
              >
                {state.mode === "edit" ? "Edit Instruction" : "Custom Requirements"}
              </label>
            </div>
            <span className="text-[11px] text-foreground/40">
              {(state.mode === "edit" ? state.editInstruction : state.requirements).length}/{MAX_REQUIREMENTS}
            </span>
          </div>
          <textarea
            id="custom-req-input"
            rows={3}
            maxLength={MAX_REQUIREMENTS}
            value={state.mode === "edit" ? state.editInstruction : state.requirements}
            onChange={(e) =>
              update(
                state.mode === "edit" ? "editInstruction" : "requirements",
                e.target.value
              )
            }
            disabled={disabled}
            placeholder="Add notes for what should stay, change, or any must-haves..."
            className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground placeholder:text-foreground/40 focus:border-brand-primary focus:outline-none disabled:opacity-50"
          />
        </div>

        {/* 8. Generate Button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={disabled || !sourceAssetId}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary text-sm font-semibold text-white transition-all hover:bg-brand-accent disabled:opacity-50 shadow-md active:translate-y-px"
        >
          <IconSparkles className="size-4" />
          <span>Generate (1 Credits)</span>
        </button>
      </div>
    );
  }
);
