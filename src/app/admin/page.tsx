"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth/session-stub";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: number;
  creditBalance: number;
}

interface AdminTask {
  id: string;
  scene: string;
  provider: string;
  model: string;
  prompt: string;
  status: string;
  created_at: number;
  updated_at: number;
  cost_credits: number;
  error_code: string | null;
  duration: number;
  durationMs: number;
}

interface HealthCheckResult {
  status: "healthy" | "unhealthy";
  latencyMs: number;
  models: string[];
  endpoint: string;
  checkedAt?: number;
}

type TabType = "users" | "tasks" | "health";

export default function AdminDashboardPage() {
  const { user } = useSession();
  const [activeTab, setActiveTab] = useState<TabType>("users");

  // Users state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");

  // Tasks state
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [taskFilterScene, setTaskFilterScene] = useState<string>("all");
  const [taskFilterStatus, setTaskFilterStatus] = useState<string>("all");

  // Health state
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Credit adjustment modal
  const [selectedUserForCredits, setSelectedUserForCredits] = useState<AdminUser | null>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState<string>("100");
  const [adjustmentReason, setAdjustmentReason] = useState<string>("");
  const [isDeduction, setIsDeduction] = useState(false);
  const [adjustingLoading, setAdjustingLoading] = useState(false);
  const [adjustingError, setAdjustingError] = useState<string | null>(null);
  const [adjustingSuccess, setAdjustingSuccess] = useState<string | null>(null);

  // Fetch Users
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setUsers(json?.data?.users ?? []);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Fetch Tasks
  const fetchTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(null);
    try {
      const res = await fetch("/api/admin/tasks", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setTasks(json?.data?.tasks ?? []);
    } catch (err) {
      setTasksError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setTasksLoading(false);
    }
  }, []);

  // Run Health Check
  const runHealthCheck = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await fetch("/api/admin/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setHealth({
        ...json.data,
        checkedAt: Date.now(),
      });
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : "Health check request failed");
      setHealth({
        status: "unhealthy",
        latencyMs: 0,
        models: [],
        endpoint: "/api/admin/health",
        checkedAt: Date.now(),
      });
    } finally {
      setHealthLoading(false);
    }
  }, []);

  // Initial load when admin role is present
  useEffect(() => {
    if (user?.role === "admin") {
      fetchUsers();
      fetchTasks();
    }
  }, [user?.role, fetchUsers, fetchTasks]);

  // Handle Credit Adjustment Submission
  const handleCreditAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForCredits) return;

    const rawNum = parseInt(adjustmentAmount, 10);
    if (isNaN(rawNum) || rawNum <= 0) {
      setAdjustingError("Please enter a valid positive number for the credit amount");
      return;
    }

    const finalAmount = isDeduction ? -rawNum : rawNum;
    const finalReason =
      adjustmentReason.trim() ||
      (isDeduction ? "Admin credit deduction" : "Admin credit grant");

    setAdjustingLoading(true);
    setAdjustingError(null);
    setAdjustingSuccess(null);

    try {
      const res = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserForCredits.id,
          amount: finalAmount,
          reason: finalReason,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const json = await res.json();
      const newBalance = json?.data?.creditBalance ?? json?.data?.balance ?? 0;

      // Update local state
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUserForCredits.id
            ? { ...u, creditBalance: newBalance }
            : u
        )
      );

      setAdjustingSuccess(
        `Successfully ${isDeduction ? "deducted" : "granted"} ${rawNum.toLocaleString()} credits. New balance: ${newBalance.toLocaleString()} credits.`
      );

      // Close modal after brief delay
      setTimeout(() => {
        setSelectedUserForCredits(null);
        setAdjustmentReason("");
        setAdjustingSuccess(null);
      }, 1400);
    } catch (err) {
      setAdjustingError(err instanceof Error ? err.message : "Credit adjustment failed");
    } finally {
      setAdjustingLoading(false);
    }
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const query = userSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(query) ||
        (u.name && u.name.toLowerCase().includes(query)) ||
        u.id.toLowerCase().includes(query)
    );
  }, [users, userSearch]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (taskFilterScene !== "all" && t.scene !== taskFilterScene) return false;
      if (taskFilterStatus !== "all" && t.status !== taskFilterStatus) return false;
      return true;
    });
  }, [tasks, taskFilterScene, taskFilterStatus]);

  // Non-Admin 403 Forbidden Screen
  if (!user || user.role !== "admin") {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-4xl flex-col items-center justify-center px-4 py-16 text-center">
        <div className="rounded-2xl border border-red-200 bg-card p-8 shadow-lg max-w-md w-full">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-red-100 text-red-600">
            <svg
              className="size-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-ink">403 Forbidden</h1>
          <p className="mt-2 text-sm text-ink/70">
            Access to the Administrator Operations Panel is restricted. Please sign in with an authorized administrator account.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <Link
              href="/api/auth/sign-in"
              className="w-full rounded-pill bg-brand-forest px-4 py-2.5 text-sm font-semibold text-paper transition-opacity hover:opacity-90 shadow-sm"
            >
              Sign In as Administrator
            </Link>
            <Link
              href="/"
              className="w-full rounded-pill border border-ink/15 bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-black/5"
            >
              Return to Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-ink/10 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="rounded-full bg-brand-forest/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-forest border border-brand-forest/20">
              Admin Console
            </span>
            <span className="rounded-full bg-brand-copper/10 px-2.5 py-0.5 text-xs font-semibold text-brand-copper">
              Live Operations
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink font-serif">
            System Administration
          </h1>
          <p className="text-sm text-ink/70 mt-1">
            Manage users, audit AI tasks, grant credits, and monitor provider health.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-ink/60">Signed in as</p>
            <p className="text-sm font-semibold text-brand-forest">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (activeTab === "users") fetchUsers();
              if (activeTab === "tasks") fetchTasks();
              if (activeTab === "health") runHealthCheck();
            }}
            className="flex items-center gap-1.5 rounded-pill border border-ink/15 bg-card px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-black/5 transition-colors"
          >
            <svg
              className={`size-3.5 ${usersLoading || tasksLoading || healthLoading ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mt-6 flex border-b border-ink/10">
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === "users"
              ? "border-brand-forest text-brand-forest"
              : "border-transparent text-ink/60 hover:text-ink hover:border-ink/20"
          }`}
        >
          <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span>User Management</span>
          <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs font-normal">
            {users.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("tasks")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === "tasks"
              ? "border-brand-forest text-brand-forest"
              : "border-transparent text-ink/60 hover:text-ink hover:border-ink/20"
          }`}
        >
          <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span>AI Task Monitor</span>
          <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs font-normal">
            {tasks.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("health");
            if (!health && !healthLoading) runHealthCheck();
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === "health"
              ? "border-brand-forest text-brand-forest"
              : "border-transparent text-ink/60 hover:text-ink hover:border-ink/20"
          }`}
        >
          <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>Provider Health Check</span>
          {health && (
            <span
              className={`size-2 rounded-full ${
                health.status === "healthy" ? "bg-emerald-500" : "bg-red-500"
              }`}
            />
          )}
        </button>
      </div>

      {/* Tab 1: User Management */}
      {activeTab === "users" && (
        <section aria-label="User Management" className="mt-6 space-y-6">
          {/* Summary Row & Search */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <input
                type="search"
                placeholder="Search user name or email…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-72 rounded-card border border-ink/15 bg-card px-3.5 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-forest focus:outline-none"
              />
              {userSearch && (
                <button
                  type="button"
                  onClick={() => setUserSearch("")}
                  className="text-xs text-ink/60 hover:text-ink underline"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="text-xs text-ink/70">
              Showing <span className="font-semibold text-ink">{filteredUsers.length}</span> of{" "}
              <span className="font-semibold text-ink">{users.length}</span> users
            </div>
          </div>

          {usersError && (
            <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">Error loading users:</p>
              <p>{usersError}</p>
            </div>
          )}

          {/* Users Table */}
          <div className="overflow-hidden rounded-2xl border border-ink/10 bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-ink">
                <thead className="border-b border-ink/10 bg-paper/80 text-xs font-semibold uppercase tracking-wider text-ink/70">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">User</th>
                    <th scope="col" className="px-6 py-3.5">Role</th>
                    <th scope="col" className="px-6 py-3.5">Created Date</th>
                    <th scope="col" className="px-6 py-3.5">Credit Balance</th>
                    <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {usersLoading && users.length === 0 ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-6 py-4"><div className="h-4 w-32 rounded bg-ink/10" /></td>
                        <td className="px-6 py-4"><div className="h-4 w-16 rounded bg-ink/10" /></td>
                        <td className="px-6 py-4"><div className="h-4 w-24 rounded bg-ink/10" /></td>
                        <td className="px-6 py-4"><div className="h-4 w-20 rounded bg-ink/10" /></td>
                        <td className="px-6 py-4 text-right"><div className="h-6 w-20 ml-auto rounded bg-ink/10" /></td>
                      </tr>
                    ))
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-ink/60">
                        {userSearch ? "No users matching search query." : "No registered users found."}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-paper/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-ink">{u.name || "Anonymous"}</div>
                          <div className="text-xs text-ink/60 font-mono">{u.email}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              u.role === "admin"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : "bg-ink/10 text-ink/80"
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-ink/70">
                          {new Date(u.createdAt).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-forest/10 px-3 py-1 font-mono text-sm font-bold text-brand-forest">
                            {u.creditBalance.toLocaleString()} Credits
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUserForCredits(u);
                              setAdjustmentAmount("100");
                              setAdjustmentReason("");
                              setIsDeduction(false);
                              setAdjustingError(null);
                              setAdjustingSuccess(null);
                            }}
                            className="rounded-pill bg-brand-forest px-3 py-1.5 text-xs font-semibold text-paper hover:bg-brand-forest/90 transition-opacity"
                          >
                            Adjust Credits
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Tab 2: AI Task Monitor */}
      {activeTab === "tasks" && (
        <section aria-label="AI Task Monitor" className="mt-6 space-y-6">
          {/* Filter Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="task-scene-filter" className="text-xs font-medium text-ink/70">
                Scene:
              </label>
              <select
                id="task-scene-filter"
                value={taskFilterScene}
                onChange={(e) => setTaskFilterScene(e.target.value)}
                className="rounded-card border border-ink/15 bg-card px-3 py-1.5 text-xs text-ink focus:border-brand-forest focus:outline-none"
              >
                <option value="all">All Scenes</option>
                <option value="interior">Interior</option>
                <option value="exterior">Exterior</option>
                <option value="floor-plan">Floor Plan</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="task-status-filter" className="text-xs font-medium text-ink/70">
                Status:
              </label>
              <select
                id="task-status-filter"
                value={taskFilterStatus}
                onChange={(e) => setTaskFilterStatus(e.target.value)}
                className="rounded-card border border-ink/15 bg-card px-3 py-1.5 text-xs text-ink focus:border-brand-forest focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="ready">Ready (Success)</option>
                <option value="processing">Processing</option>
                <option value="accepted">Accepted</option>
                <option value="failed">Failed</option>
                <option value="quarantined">Quarantined</option>
              </select>
            </div>

            <div className="ml-auto text-xs text-ink/70">
              Showing <span className="font-semibold text-ink">{filteredTasks.length}</span> of{" "}
              <span className="font-semibold text-ink">{tasks.length}</span> recent tasks
            </div>
          </div>

          {tasksError && (
            <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">Error loading tasks:</p>
              <p>{tasksError}</p>
            </div>
          )}

          {/* Tasks Table */}
          <div className="overflow-hidden rounded-2xl border border-ink/10 bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-ink">
                <thead className="border-b border-ink/10 bg-paper/80 text-xs font-semibold uppercase tracking-wider text-ink/70">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Task ID</th>
                    <th scope="col" className="px-5 py-3.5">Scene</th>
                    <th scope="col" className="px-5 py-3.5">Provider & Model</th>
                    <th scope="col" className="px-5 py-3.5">Status</th>
                    <th scope="col" className="px-5 py-3.5">Cost</th>
                    <th scope="col" className="px-5 py-3.5">Duration</th>
                    <th scope="col" className="px-5 py-3.5">Created At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {tasksLoading && tasks.length === 0 ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-5 py-4"><div className="h-4 w-24 rounded bg-ink/10" /></td>
                        <td className="px-5 py-4"><div className="h-4 w-16 rounded bg-ink/10" /></td>
                        <td className="px-5 py-4"><div className="h-4 w-28 rounded bg-ink/10" /></td>
                        <td className="px-5 py-4"><div className="h-4 w-16 rounded bg-ink/10" /></td>
                        <td className="px-5 py-4"><div className="h-4 w-12 rounded bg-ink/10" /></td>
                        <td className="px-5 py-4"><div className="h-4 w-14 rounded bg-ink/10" /></td>
                        <td className="px-5 py-4"><div className="h-4 w-20 rounded bg-ink/10" /></td>
                      </tr>
                    ))
                  ) : filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-ink/60">
                        No AI generation tasks found.
                      </td>
                    </tr>
                  ) : (
                    filteredTasks.map((t) => (
                      <tr key={t.id} className="hover:bg-paper/40 transition-colors">
                        <td className="px-5 py-4 font-mono text-xs text-ink/80">
                          <span title={t.id}>{t.id.slice(0, 12)}…</span>
                          {t.prompt && (
                            <p className="mt-1 line-clamp-1 text-[11px] text-ink/50 font-sans" title={t.prompt}>
                              {t.prompt}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex rounded-full bg-brand-forest/10 px-2.5 py-0.5 text-xs font-semibold text-brand-forest capitalize">
                            {t.scene}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs">
                          <div className="font-semibold text-ink">{t.provider}</div>
                          <div className="text-[11px] text-ink/60 font-mono">{t.model}</div>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              t.status === "ready"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : t.status === "processing"
                                  ? "bg-amber-100 text-amber-800 border border-amber-300 animate-pulse"
                                  : t.status === "failed"
                                    ? "bg-red-100 text-red-800 border border-red-300"
                                    : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {t.status}
                          </span>
                          {t.error_code && (
                            <p className="mt-1 text-[11px] text-red-600 font-mono">{t.error_code}</p>
                          )}
                        </td>
                        <td className="px-5 py-4 text-xs font-mono font-semibold text-ink">
                          {t.cost_credits} c
                        </td>
                        <td className="px-5 py-4 text-xs font-mono text-ink/70">
                          {t.duration > 0 ? `${t.duration.toLocaleString()} ms` : "—"}
                        </td>
                        <td className="px-5 py-4 text-xs text-ink/60">
                          {new Date(t.created_at).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Tab 3: Provider Health Check */}
      {activeTab === "health" && (
        <section aria-label="Provider Health Check" className="mt-6 max-w-3xl space-y-6">
          <div className="rounded-2xl border border-ink/10 bg-card p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-ink">AI Provider Status</h2>
                <p className="text-xs text-ink/60 mt-0.5">
                  Verify latency and model capabilities against Cliproxy / Gemini API.
                </p>
              </div>

              <button
                type="button"
                onClick={runHealthCheck}
                disabled={healthLoading}
                className="flex items-center justify-center gap-2 rounded-pill bg-brand-forest px-5 py-2 text-sm font-semibold text-paper shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {healthLoading && (
                  <svg className="size-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                <span>{healthLoading ? "Checking Provider…" : "Run Health Check"}</span>
              </button>
            </div>

            {healthError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <p className="font-semibold">Health check error:</p>
                <p>{healthError}</p>
              </div>
            )}

            {health && (
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Status Card */}
                <div className="rounded-xl border border-ink/10 bg-paper/60 p-4">
                  <p className="text-xs font-semibold text-ink/60 uppercase tracking-wider">Status</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                        health.status === "healthy"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : "bg-red-100 text-red-800 border border-red-300"
                      }`}
                    >
                      <span
                        className={`size-2 rounded-full ${
                          health.status === "healthy" ? "bg-emerald-500" : "bg-red-500"
                        }`}
                      />
                      {health.status === "healthy" ? "Healthy (200 OK)" : "Unhealthy (Failed)"}
                    </span>
                  </div>
                </div>

                {/* Latency Card */}
                <div className="rounded-xl border border-ink/10 bg-paper/60 p-4">
                  <p className="text-xs font-semibold text-ink/60 uppercase tracking-wider">Round-Trip Latency</p>
                  <p className="mt-1 text-2xl font-bold font-mono text-brand-forest">
                    {health.latencyMs} <span className="text-sm font-sans font-normal text-ink/60">ms</span>
                  </p>
                </div>

                {/* Endpoint Info */}
                <div className="sm:col-span-2 rounded-xl border border-ink/10 bg-paper/60 p-4">
                  <p className="text-xs font-semibold text-ink/60 uppercase tracking-wider">Endpoint</p>
                  <p className="mt-1 font-mono text-xs text-ink/80 break-all bg-card p-2 rounded border border-ink/10">
                    {health.endpoint}
                  </p>
                </div>

                {/* Supported Models */}
                <div className="sm:col-span-2 rounded-xl border border-ink/10 bg-paper/60 p-4">
                  <p className="text-xs font-semibold text-ink/60 uppercase tracking-wider">
                    Available Models ({health.models.length})
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {health.models.length > 0 ? (
                      health.models.map((m) => (
                        <span
                          key={m}
                          className="rounded-full bg-brand-forest/10 border border-brand-forest/20 px-3 py-1 font-mono text-xs font-semibold text-brand-forest"
                        >
                          {m}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-ink/60">No model list returned from provider.</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Credit Adjustment Modal Dialog */}
      {selectedUserForCredits && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="credit-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-ink/10 bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink/10 pb-4">
              <div>
                <h3 id="credit-modal-title" className="text-lg font-bold text-ink">
                  Adjust User Credits
                </h3>
                <p className="text-xs text-ink/60">
                  Grant promotional credits or deduct testing quota.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserForCredits(null)}
                className="rounded-lg p-1.5 text-ink/60 hover:bg-black/5 hover:text-ink"
              >
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* User Details */}
            <div className="mt-4 rounded-xl border border-ink/10 bg-paper/60 p-3.5 text-xs text-ink/80 space-y-1">
              <div className="flex justify-between">
                <span className="text-ink/60">User:</span>
                <span className="font-semibold text-ink">{selectedUserForCredits.name || "Anonymous"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink/60">Email:</span>
                <span className="font-mono text-ink">{selectedUserForCredits.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink/60">Current Balance:</span>
                <span className="font-bold text-brand-forest font-mono">
                  {selectedUserForCredits.creditBalance.toLocaleString()} Credits
                </span>
              </div>
            </div>

            <form onSubmit={handleCreditAdjustmentSubmit} className="mt-4 space-y-4">
              {/* Type Switcher */}
              <div>
                <label className="text-xs font-semibold text-ink/70 block mb-1.5">Action Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDeduction(false)}
                    className={`rounded-card py-2 text-xs font-bold border transition-colors ${
                      !isDeduction
                        ? "bg-emerald-100 border-emerald-400 text-emerald-900"
                        : "bg-paper border-ink/15 text-ink/70 hover:bg-black/5"
                    }`}
                  >
                    + Grant Credits
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDeduction(true)}
                    className={`rounded-card py-2 text-xs font-bold border transition-colors ${
                      isDeduction
                        ? "bg-red-100 border-red-400 text-red-900"
                        : "bg-paper border-ink/15 text-ink/70 hover:bg-black/5"
                    }`}
                  >
                    − Deduct Credits
                  </button>
                </div>
              </div>

              {/* Amount Input & Presets */}
              <div>
                <label htmlFor="credit-amount-input" className="text-xs font-semibold text-ink/70 block mb-1">
                  Amount
                </label>
                <input
                  id="credit-amount-input"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(e.target.value)}
                  className="w-full rounded-card border border-ink/15 bg-card px-3.5 py-2 text-sm font-mono font-bold text-ink focus:border-brand-forest focus:outline-none"
                  placeholder="e.g. 500"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[50, 100, 500, 1000, 10000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAdjustmentAmount(String(preset))}
                      className="rounded-pill border border-ink/15 bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink/80 hover:bg-black/5"
                    >
                      {preset.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason Field */}
              <div>
                <label htmlFor="credit-reason-input" className="text-xs font-semibold text-ink/70 block mb-1">
                  Audit Reason (optional)
                </label>
                <input
                  id="credit-reason-input"
                  type="text"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  placeholder={isDeduction ? "e.g. Manual test deduction" : "e.g. Promotional grant, Support compensation"}
                  className="w-full rounded-card border border-ink/15 bg-card px-3.5 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-forest focus:outline-none"
                />
              </div>

              {/* Feedback messages */}
              {adjustingError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  {adjustingError}
                </div>
              )}
              {adjustingSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 font-semibold">
                  {adjustingSuccess}
                </div>
              )}

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-ink/10">
                <button
                  type="button"
                  onClick={() => setSelectedUserForCredits(null)}
                  disabled={adjustingLoading}
                  className="rounded-pill border border-ink/15 bg-paper px-4 py-2 text-xs font-semibold text-ink hover:bg-black/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustingLoading}
                  className="rounded-pill bg-brand-forest px-5 py-2 text-xs font-semibold text-paper shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {adjustingLoading ? "Processing…" : "Confirm Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
