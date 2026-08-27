import type { Metadata } from "next";
import { DesignFlow } from "@/components/design";
import { parseDesignSearchParams } from "@/lib/design/state";

export const metadata: Metadata = {
  title: "AI Interior Design - Redesign Your Room from a Photo | HomeDesign",
  description:
    "Upload a room photo and let HomeDesign AI generate warm, realistic interior design ideas in seconds.",
};

function toSearchParams(
  raw: Record<string, string | string[] | undefined>
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.append(key, value);
    }
  }
  return params;
}

export default async function InteriorDesignPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preset = parseDesignSearchParams(toSearchParams(params), "interior");

  return (
    <DesignFlow
      scene="interior"
      title="AI Interior Design"
      description="Upload a room photo and let HomeDesign AI generate warm, realistic interior design ideas in seconds."
      sceneLabel="room"
      initialPreset={preset}
    />
  );
}
