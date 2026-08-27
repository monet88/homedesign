import { requireAdminSession } from "@/lib/auth/server";

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (!auth.authorized) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await auth.env.DB.prepare(
      `SELECT 
         u.id, 
         u.name, 
         u.email, 
         u.role, 
         u.createdAt,
         COALESCE((
           SELECT 
             COALESCE(SUM(CASE 
               WHEN cl.entry_type IN ('grant', 'payment', 'release', 'adjustment') THEN cl.amount 
               WHEN cl.entry_type IN ('hold', 'usage') THEN -cl.amount 
               ELSE 0 
             END), 0)
           FROM credit_ledger cl
           WHERE cl.user_id = u.id
         ) - (
           SELECT COALESCE(SUM(ch.amount), 0)
           FROM credit_holds ch
           WHERE ch.user_id = u.id AND ch.status = 'active'
         ), 0) AS creditBalance
       FROM user u
       ORDER BY u.createdAt DESC`
    ).all<{
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
        },
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DATABASE_ERROR";
    return Response.json({ error: message }, { status: 500 });
  }
}
