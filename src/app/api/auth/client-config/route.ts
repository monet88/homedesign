import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AuthEnv } from "@/lib/auth/server";

// Public auth client config (no secrets). Used by Google One Tap in the browser.

export async function GET() {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as AuthEnv;
  return Response.json(
    {
      googleClientId: env.GOOGLE_CLIENT_ID ?? null,
    },
    { headers: { "cache-control": "public, max-age=300" } }
  );
}
