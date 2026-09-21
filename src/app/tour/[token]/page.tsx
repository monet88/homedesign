import type { Metadata } from "next";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/bindings";
import { getTourByShareToken } from "@/lib/panorama/tour-service";
import TourViewPanel from "./tour-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as Env;
  const tour = await getTourByShareToken(env.DB, token);

  if (!tour) {
    return {
      title: "3D Panorama VR Tour | HomeDesign AI",
      description: "Bản xem thực tế ảo 360 độ photorealistic.",
    };
  }

  const origin = env.BETTER_AUTH_URL || "https://design.7app.online";
  const firstScene = tour.scenes?.[0];
  const imageUrl = firstScene
    ? `${origin}/api/assets/${encodeURIComponent(firstScene.assetId)}/download`
    : undefined;

  const title = `${tour.title} — 3D Panorama VR Tour 360° | HomeDesign AI`;
  const description =
    tour.description ||
    `Trải nghiệm thực tế ảo 360 độ căn nhà đa không gian ${tour.title} với góc nhìn toàn cảnh tương tác chuẩn kiến trúc.`;

  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: imageUrl ? [{ url: imageUrl, alt: tour.title }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: imageUrl ? [imageUrl] : [],
    },
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ embed?: string }>;
}) {
  const { token } = await params;
  const search = searchParams ? await searchParams : {};
  const isEmbed = search?.embed === "1";
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as Env;
  const tour = await getTourByShareToken(env.DB, token);

  let branding = null;
  if (tour?.workspaceId) {
    try {
      const { getWorkspaceBranding } = await import("@/lib/branding/branding-service");
      branding = await getWorkspaceBranding(env, tour.workspaceId);
    } catch {
      // workspace branding fallback
    }
  }

  return <TourViewPanel token={token} tour={tour} branding={branding} isEmbed={isEmbed} />;
}
