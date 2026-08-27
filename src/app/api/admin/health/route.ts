import { requireAdminSession } from "@/lib/auth/server";
import {
  DEFAULT_AI_API_BASE_URL,
  FALLBACK_AI_API_KEY,
} from "@/lib/ai/gemini-adapter";

async function checkHealth(request: Request) {
  const auth = await requireAdminSession(request);
  if (!auth.authorized) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const baseUrl = (
    auth.env.AI_API_BASE_URL ||
    (typeof process !== "undefined" ? process.env?.AI_API_BASE_URL : undefined) ||
    DEFAULT_AI_API_BASE_URL
  )
    .trim()
    .replace(/\/+$/, "");

  const apiKey =
    auth.env.AI_API_KEY ||
    (typeof process !== "undefined" ? process.env?.AI_API_KEY : undefined);

  const endpoint = baseUrl.endsWith("/v1")
    ? `${baseUrl}/models`
    : `${baseUrl}/v1/models`;

  const start = performance.now();
  let status: "healthy" | "unhealthy" = "unhealthy";
  let latencyMs = 0;
  let models: string[] = [];

  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetch(endpoint, {
      method: "GET",
      headers,
    });

    latencyMs = Math.max(1, Math.round(performance.now() - start));

    if (res.ok) {
      status = "healthy";
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (Array.isArray(json?.data)) {
        models = (json.data as Array<{ id?: string; name?: string }>)
          .map((m) => m.id || m.name)
          .filter((id): id is string => typeof id === "string" && id.length > 0);
      } else if (Array.isArray(json?.models)) {
        models = (json.models as Array<{ id?: string; name?: string }>)
          .map((m) => m.id || m.name)
          .filter((id): id is string => typeof id === "string" && id.length > 0);
      }
      if (models.length === 0) {
        models = ["gemini-3.1-flash-image", "gemini-2.5-flash-image"];
      }
    } else {
      status = "unhealthy";
    }
  } catch {
    latencyMs = Math.max(1, Math.round(performance.now() - start));
    status = "unhealthy";
  }

  return Response.json(
    {
      code: 0,
      data: {
        status,
        latencyMs,
        models,
        endpoint,
      },
    },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function GET(request: Request) {
  return checkHealth(request);
}

export async function POST(request: Request) {
  return checkHealth(request);
}
