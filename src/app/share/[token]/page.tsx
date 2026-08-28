import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/bindings";
import { getShareViewByToken } from "@/lib/library/share";
import ShareViewPanel from "./share-view";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cf = await getCloudflareContext({ async: true });
  const view = await getShareViewByToken(cf.env as unknown as Env, token);
  return <ShareViewPanel token={token} view={view} />;
}
