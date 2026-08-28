// Ticket #41: Server-side admin authorization boundary.
//
// This page is a Server Component that resolves the session before rendering.
// Anonymous visitors and non-admin users receive the unauthorized screen
// (no dashboard markup is ever sent). Admin sessions receive the full
// interactive dashboard without a client-side authorization flicker.

import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolveSession, type AuthEnv } from "@/lib/auth/server";
import AdminDashboard from "./_components/admin-dashboard";
import AdminUnauthorized from "./_components/admin-unauthorized";

export default async function AdminPage() {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as AuthEnv;

  // Read incoming request headers (cookies, auth) so resolveSession
  // can check the BetterAuth session cookie server-side.
  const hdrs = await headers();
  const session = await resolveSession(env, hdrs);

  // 401 — anonymous visitor
  if (!session) {
    return <AdminUnauthorized status={401} />;
  }

  // 403 — authenticated but not admin
  if (session.user.role !== "admin") {
    return <AdminUnauthorized status={403} />;
  }

  // Admin session — render the interactive dashboard
  return <AdminDashboard adminEmail={session.user.email} />;
}
