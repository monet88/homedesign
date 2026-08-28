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

    const rawLimit = parseInt(url.searchParams.get("limit") || "20", 10);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 100);

    const offset = (page - 1) * limit;

    const countResult = await auth.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM user`
    ).first<{ total: number }>();

    const total = countResult?.total ?? 0;
    const totalPages = Math.ceil(total / limit);

    const result = await auth.env.DB.prepare(
      `SELECT 
         u.id, 
         u.name, 
         u.email, 
         u.role, 
         u.createdAt,
         COALESCE((
           SELECT COALESCE(SUM(cl.amount), 0)
           FROM credit_ledger cl
           WHERE cl.user_id = u.id AND cl.entry_type IN ('grant', 'payment')
         ) - (
           SELECT COALESCE(SUM(cl.amount), 0)
           FROM credit_ledger cl
           WHERE cl.user_id = u.id AND cl.entry_type = 'usage'
         ) - (
           SELECT COALESCE(SUM(ch.amount), 0)
           FROM credit_holds ch
           WHERE ch.user_id = u.id AND ch.status = 'active'
         ), 0) AS creditBalance
       FROM user u
       ORDER BY u.createdAt DESC
       LIMIT ?1 OFFSET ?2`
    )
      .bind(limit, offset)
      .all<{
        id: string;
        name: string;
        email: string;
        role: string;
        createdAt: number;
        creditBalance: number;
      }>();

    const users = (result.results ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      creditBalance: Math.max(0, Number(u.creditBalance ?? 0)),
    }));

    return Response.json(
      {
        code: 0,
        data: {
          users,
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
