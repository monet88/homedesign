import { requireAdminSession } from "@/lib/auth/server";
import { getProvider } from "@/lib/ai/provider-adapter";

async function checkHealth(request: Request) {
  const auth = await requireAdminSession(request);
  if (!auth.authorized) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const provider = getProvider("gemini", auth.env);
  const result = await provider.healthCheck();

  return Response.json(
    {
      code: 0,
      data: result,
    },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function POST(request: Request) {
  return checkHealth(request);
}
