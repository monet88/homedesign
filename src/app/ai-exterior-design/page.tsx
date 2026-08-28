import type { Metadata } from "next";
import { DesignFlow } from "@/components/design";
import { parseDesignSearchParams } from "@/lib/design/state";

export const metadata: Metadata = {
  title: "AI Exterior Design - Home Exterior Design from a Photo | HomeDesign",
  description:
    "Upload a house photo and let HomeDesign AI generate realistic exterior design concepts for facades, porches, and outdoor spaces.",
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

export default async function ExteriorDesignPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preset = parseDesignSearchParams(toSearchParams(params), "exterior");

  return (
    <DesignFlow
      scene="exterior"
      title="AI Exterior Design"
      description="Upload a photo of your house, choose an exterior area and architectural style, and preview a new direction before you renovate."
      sceneLabel="exterior"
      initialPreset={preset}
    />
  );
}
