import { requireAdminSession } from "@/lib/auth/server";

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (!auth.authorized) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(request.url);
    const rawPage = parseInt(url.searchParams.get("page") || "1", 10);
    const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;

    const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? 50 : Math.min(rawLimit, 100);

    const offset = (page - 1) * limit;

    const countResult = await auth.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM ai_tasks`
    ).first<{ total: number }>();

    const total = countResult?.total ?? 0;
    const totalPages = Math.ceil(total / limit);

    const result = await auth.env.DB.prepare(
      `SELECT 
         id, 
         scene, 
         provider, 
         model, 
         prompt, 
         status, 
         created_at, 
         updated_at, 
         cost_credits, 
         error_code
       FROM ai_tasks
       ORDER BY created_at DESC
       LIMIT ?1 OFFSET ?2`
    )
      .bind(limit, offset)
      .all<{
        id: string;
        scene: string;
        provider: string;
        model: string;
        prompt: string;
        status: string;
        created_at: number;
        updated_at: number;
        cost_credits: number | null;
        error_code: string | null;
      }>();

    const tasks = (result.results ?? []).map((t) => {
      const duration = Math.max(0, (t.updated_at ?? t.created_at) - t.created_at);
      return {
        id: t.id,
        scene: t.scene,
        provider: t.provider,
        model: t.model,
        prompt: t.prompt,
        status: t.status,
        created_at: t.created_at,
        updated_at: t.updated_at,
        cost_credits: t.cost_credits ?? 0,
        error_code: t.error_code ?? null,
        duration,
        durationMs: duration,
      };
    });

    return Response.json(
      {
        code: 0,
        data: {
          tasks,
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        },
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DATABASE_ERROR";
    return Response.json({ error: message }, { status: 500 });
  }
}
