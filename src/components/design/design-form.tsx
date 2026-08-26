"use client";

// Design form fields (ticket #14). Renders the full redesign/edit controls for
// either Interior or Exterior and emits the serialized DesignConfig body.

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

const MAX_REQUIREMENTS = 300;

interface DesignFormProps {
  scene: "interior" | "exterior";
  sourceAssetId: string | null;
  initialPreset?: DesignPreset;
  disabled?: boolean;
  onGenerate: (body: Record<string, unknown>, sourceAssetId: string) => void;
  onToast: (message: string, variant?: "error") => void;
}

export interface DesignFormHandle {
  /** Build a fresh config with a new idempotency key and submit it. */
  generate: () => void;
}

export const DesignForm = forwardRef<DesignFormHandle, DesignFormProps>(
  function DesignForm(
    {
      scene,
      sourceAssetId,
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

  useEffect(() => {
    if (initialPreset) {
      setState((prev) => applyPreset(prev, initialPreset));
    }
  }, [initialPreset]);

  const isCustomPalette = state.colorScheme === "Custom";
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
  const paletteOptions =
    scene === "interior"
      ? [...INTERIOR_PALETTES]
      : [...EXTERIOR_PALETTES];

  function update<K extends keyof DesignFormState>(key: K, value: DesignFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function handleGenerate() {
    onGenerate(buildDesignConfig(scene, state, sourceAssetId ?? ""), sourceAssetId ?? "");
  }

  useImperativeHandle(ref, () => ({
    generate: handleGenerate,
  }));

  const requirementsLabel =
    state.mode === "edit" ? "Instruction" : "Custom Requirements";

  return (
    <div className="space-y-5">
      {/* Mode switch */}
      <div className="flex items-center gap-2 rounded-pill border border-ink/10 bg-paper p-1">
        {DESIGN_MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => update("mode", m.value)}
            aria-pressed={state.mode === m.value}
            className={
              "flex-1 rounded-pill px-4 py-2 text-sm font-medium transition-colors" +
              (state.mode === m.value
                ? " bg-ink text-paper"
                : " text-ink/70 hover:text-ink")
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Model (static display) */}
      <div>
        <label className="block text-xs font-medium text-ink/70">Model</label>
        <div className="mt-1 rounded-card border border-ink/10 bg-ink/5 px-3 py-2 text-sm text-ink/80">
          Nano Banana
        </div>
      </div>

      {/* Room / Area */}
      <div>
        <label htmlFor="room-area-select" className="block text-xs font-medium text-ink/70">
          {scene === "interior" ? "Room Type" : "Area"}
        </label>
        <select
          id="room-area-select"
          value={scene === "interior" ? state.roomType : state.area}
          onChange={(e) =>
            update(scene === "interior" ? "roomType" : "area", e.target.value)
          }
          disabled={disabled || state.mode === "edit"}
          className="mt-1 block w-full rounded-card border border-ink/10 bg-paper px-3 py-2 text-sm text-ink focus:border-ink/30 focus:outline-none disabled:opacity-50"
        >
          {roomOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {isCustomRoom && scene === "interior" && (
          <input
            type="text"
            value={state.customRoomType}
            onChange={(e) => update("customRoomType", e.target.value)}
            placeholder="e.g. reading nook"
            className="mt-2 block w-full rounded-card border border-ink/10 bg-paper px-3 py-2 text-sm text-ink focus:border-ink/30 focus:outline-none"
          />
        )}
        {isCustomArea && scene === "exterior" && (
          <input
            type="text"
            value={state.customArea}
            onChange={(e) => update("customArea", e.target.value)}
            placeholder="e.g. side garden"
            className="mt-2 block w-full rounded-card border border-ink/10 bg-paper px-3 py-2 text-sm text-ink focus:border-ink/30 focus:outline-none"
          />
        )}
      </div>

      {/* Style */}
      <div>
        <label className="block text-xs font-medium text-ink/70">
          {scene === "interior" ? "Design Style" : "Exterior Style"}
        </label>
        <select
          value={state.style}
          onChange={(e) => update("style", e.target.value)}
          disabled={disabled || state.mode === "edit"}
          className="mt-1 block w-full rounded-card border border-ink/10 bg-paper px-3 py-2 text-sm text-ink focus:border-ink/30 focus:outline-none disabled:opacity-50"
        >
          {styleOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {isCustomStyle && (
          <input
            type="text"
            value={state.customStyle}
            onChange={(e) => update("customStyle", e.target.value)}
            placeholder="e.g. rustic coastal"
            className="mt-2 block w-full rounded-card border border-ink/10 bg-paper px-3 py-2 text-sm text-ink focus:border-ink/30 focus:outline-none"
          />
        )}
      </div>

      {/* Palette */}
      <div>
        <label className="block text-xs font-medium text-ink/70">Palette</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {paletteOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => update("colorScheme", opt)}
              aria-pressed={state.colorScheme === opt}
              disabled={disabled || state.mode === "edit"}
              className={
                "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50" +
                (state.colorScheme === opt
                  ? " border-ink bg-ink text-paper"
                  : " border-ink/20 text-ink/80 hover:border-ink/50")
              }
            >
              {opt}
            </button>
          ))}
        </div>
        {isCustomPalette && (
          <input
            type="text"
            value={state.customColorScheme}
            onChange={(e) => update("customColorScheme", e.target.value)}
            placeholder={
              scene === "interior"
                ? "e.g. navy blue and brass…"
                : "e.g. sage green siding…"
            }
            className="mt-3 block w-full rounded-card border border-ink/10 bg-paper px-3 py-2 text-sm text-ink focus:border-ink/30 focus:outline-none"
          />
        )}
      </div>

      {/* Aspect ratio */}
      <div>
        <label className="block text-xs font-medium text-ink/70">Aspect Ratio</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {ASPECT_RATIO_OPTIONS.map((ratio) => (
            <button
              key={ratio}
              type="button"
              onClick={() => update("aspectRatio", ratio)}
              aria-pressed={state.aspectRatio === ratio}
              disabled={disabled}
              className={
                "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50" +
                (state.aspectRatio === ratio
                  ? " border-ink bg-ink text-paper"
                  : " border-ink/20 text-ink/80 hover:border-ink/50")
              }
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      {/* Requirements / Instruction */}
      <div>
        <div className="flex items-center justify-between">
          <label className="block text-xs font-medium text-ink/70">
            {requirementsLabel}
          </label>
          <span className="text-xs text-ink/50">
            {state.requirements.length}/{MAX_REQUIREMENTS}
          </span>
        </div>
        <textarea
          value={state.requirements}
          onChange={(e) =>
            update(
              "requirements",
              e.target.value.slice(0, MAX_REQUIREMENTS)
            )
          }
          disabled={disabled}
          placeholder={
            state.mode === "edit"
              ? "Describe the change you want…"
              : "Add any extra directions…"
          }
          rows={3}
          className="mt-1 block w-full resize-none rounded-card border border-ink/10 bg-paper px-3 py-2 text-sm text-ink focus:border-ink/30 focus:outline-none disabled:opacity-50"
        />
      </div>

      {/* Generate */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={disabled}
        className="w-full rounded-pill bg-ink px-5 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        Generate (1 Credits)
      </button>
    </div>
  );
});

DesignForm.displayName = "DesignForm";
