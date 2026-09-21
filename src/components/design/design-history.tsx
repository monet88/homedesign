"use client";

import { IconImagePlus } from "@/components/shell/icons";

interface HistoryRecord {
  id: string;
  sourceAssetId: string;
  outputAssetId: string | null;
  status: string;
  cost: number;
  createdAt: number;
  errorCode: string | null;
}

interface DesignHistoryProps {
  scene: "interior" | "exterior";
  history: HistoryRecord[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function DesignHistory({
  scene,
  history,
  activeId,
  onSelect,
}: DesignHistoryProps) {
  const title =
    scene === "exterior"
      ? "AI Exterior Design History"
      : "AI Interior Design History";

  return (
    <div className="mt-6 rounded-2xl border border-border/80 bg-[#fbf9f5] p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>

      {history.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="flex flex-col justify-between rounded-xl border border-border/60 bg-card p-3 aspect-square shadow-2xs"
            >
              <div className="flex flex-1 items-center justify-center">
                <IconImagePlus className="size-8 text-foreground/20" />
              </div>
              <div className="space-y-1.5 pt-2">
                <div className="h-2 w-3/4 rounded-full bg-foreground/10" />
                <div className="flex items-center justify-between">
                  <div className="h-2 w-1/2 rounded-full bg-foreground/10" />
                  <span className="text-[10px] text-foreground/30">•••</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {history.map((rec, i) => {
            const isFailed = rec.status === "failed";
            const isPending = rec.status === "processing" || rec.status === "queued";
            return (
              <button
                key={rec.id}
                type="button"
                onClick={() => onSelect(rec.id)}
                className={`group relative flex flex-col justify-between rounded-xl border p-2 aspect-square text-left transition-all ${
                  rec.id === activeId
                    ? "border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary"
                    : "border-border/80 bg-card hover:bg-black/5"
                }`}
              >
                <div className="relative flex-1 overflow-hidden rounded-lg bg-black/5">
                  {rec.outputAssetId ? (
                    <img
                      src={`/api/assets/${rec.outputAssetId}/download`}
                      alt={`Variation #${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                  ) : isFailed ? (
                    <div className="flex h-full flex-col items-center justify-center p-2 text-center">
                      <span className="flex size-7 items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-bold">
                        ✕
                      </span>
                      <span className="mt-1 text-[10px] font-semibold text-red-600">
                        Generation Failed
                      </span>
                    </div>
                  ) : isPending ? (
                    <div className="flex h-full flex-col items-center justify-center p-2 text-center">
                      <div className="size-5 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                      <span className="mt-1.5 text-[10px] font-medium text-foreground/60">
                        Generating…
                      </span>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <IconImagePlus className="size-6 text-foreground/30" />
                    </div>
                  )}

                  {isFailed && (
                    <span className="absolute top-1 right-1 rounded-full bg-red-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-2xs">
                      Refunded
                    </span>
                  )}
                </div>
                <div className="pt-2">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-xs font-semibold text-foreground">
                      Variation #{i + 1}
                    </p>
                    {isFailed ? (
                      <span className="text-[9px] font-medium text-red-500">Refunded</span>
                    ) : (
                      <span className="text-[9px] font-medium text-brand-copper">{rec.cost} cr</span>
                    )}
                  </div>
                  <p className="text-[10px] text-foreground/50">
                    {new Date(rec.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
