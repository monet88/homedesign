import type { Metadata } from "next";
import { DesignFlow } from "@/components/design";
import { parseDesignSearchParams } from "@/lib/design/state";

export const metadata: Metadata = {
  title: "AI Exterior Design — HomeDesign Clone",
  description:
    "Upload a home facade photo, choose an exterior style and palette, and visualize a new look.",
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
      description="Upload a facade or exterior photo, choose a style and palette, and see your curb appeal transformed."
      sceneLabel="home"
      initialPreset={preset}
    />
  );
}
