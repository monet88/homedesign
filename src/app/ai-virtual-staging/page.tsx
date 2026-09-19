import type { Metadata } from "next";
import { DesignFlow } from "@/components/design";
import { parseDesignSearchParams } from "@/lib/design/state";

export const metadata: Metadata = {
  title: "AI Virtual Staging for Real Estate - Furnish Empty Rooms | HomeDesign",
  description:
    "Transform vacant and empty room photos into beautifully furnished luxury listings that sell and rent 3x faster with AI Virtual Staging.",
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

export default async function VirtualStagingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const urlParams = toSearchParams(params);
  // Default to virtual-staging mode if not explicitly overridden
  if (!urlParams.has("mode")) {
    urlParams.set("mode", "virtual-staging");
  }
  const preset = parseDesignSearchParams(urlParams, "interior");

  return (
    <DesignFlow
      scene="interior"
      title="AI Virtual Staging for Real Estate"
      description="Turn vacant, unfurnished rooms into staged luxury turnkey apartments and homes for real estate listings in seconds."
      sceneLabel="empty room"
      initialPreset={preset}
    />
  );
}
