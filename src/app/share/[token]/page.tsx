import type { Metadata } from "next";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/bindings";
import { getShareViewByToken } from "@/lib/library/share";
import ShareViewPanel from "./share-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const cf = await getCloudflareContext({ async: true });
  const view = await getShareViewByToken(cf.env as unknown as Env, token);

  if (!view) {
    return {
      title: "Shared Design | HomeDesign AI",
      description: "Explore AI-powered architectural and interior redesigns.",
    };
  }

  const origin = (cf.env as unknown as Env).BETTER_AUTH_URL || "https://design.7app.online";
  const firstAsset = view.assets[0];
  const imageUrl = firstAsset
    ? `${origin}/api/share/${encodeURIComponent(token)}/assets/${encodeURIComponent(firstAsset.id)}`
    : undefined;

  const kindLabel = view.kind.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const title = `${view.name} — ${kindLabel} Design | HomeDesign AI`;
  const description = `Khám phá thiết kế ${view.kind} photorealistic được tạo bởi HomeDesign AI. So sánh Before & After ở độ phân giải cao.`;

  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: imageUrl ? [{ url: imageUrl, alt: view.name }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: imageUrl ? [imageUrl] : [],
    },
  };
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cf = await getCloudflareContext({ async: true });
  const view = await getShareViewByToken(cf.env as unknown as Env, token);
  return <ShareViewPanel token={token} view={view} />;
}
