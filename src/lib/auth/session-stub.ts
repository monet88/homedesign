// Session hook for the application shell (tickets 02 + 03).
//
// Ticket #02 defined the shape contract (`Session` / `SessionUser`) that the
// Header consumes. Ticket #03 (ADR 0001) replaces the anonymous stub body with
// a real fetch against BetterAuth `GET /api/auth/get-session`, polling on
// mount and on window focus. The JSON never contains the session token (the
// route redacts it), so the browser only ever holds the httpOnly cookie.
//
// MUST NOT change: the shape of `Session` below — Header and the shell tests
// depend on it. Auth tickets extend `user` with the real fields, they do not
// reshape the anonymous/logged-in switch.

"use client";

import { useEffect, useState } from "react";

export interface SessionUser {
  /** User unique identifier. */
  id?: string;
  /** Display name (falls back to email local-part). */
  name: string;
  /** Initial rendered in the avatar. */
  initial: string;
  /** Email, if the provider exposes it. */
  email?: string;
  /** Server-verified email flag (ADR 0001 gate). */
  emailVerified?: boolean;
  /** User role ('admin' | 'user'). */
  role?: "admin" | "user";
}

export interface Session {
  /** Non-null when the visitor is signed in. */
  user: SessionUser | null;
  /** Hook point for ticket #03: credit badge (Available Credits, spec US 12). */
  credits: number | null;
  /** False once initial session resolution has completed. */
  loading?: boolean;
}

const ANONYMOUS: Session = { user: null, credits: null, loading: false };

/**
 * Anonymous is the default state until a real session arrives. Return a
 * stable reference so `useSession` consumers can rely on referential identity.
 */
export function getAnonymousSession(): Session {
  return ANONYMOUS;
}

/**
 * Derive the display name + avatar initial for a session user.
 * Pure helper — unit-tested (see src/lib/auth/session-stub.test.ts).
 */
export function deriveSessionUser(input: {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: "admin" | "user" | null;
}): SessionUser {
  const name = input.name?.trim() || input.email?.trim() || "Guest";
  const initial = (name[0] ?? "G").toUpperCase();
  return { id: input.id ?? undefined, name, initial, email: input.email ?? undefined, role: input.role ?? "user" };
}

interface GetSessionResponse {
  session: {
    id: string;
    userId: string;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    role?: "admin" | "user";
    image?: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

// `GET /api/credits` response (ADR 0002 envelope convention).
interface GetCreditsResponse {
  code: 0;
  data: {
    available: number;
    activeHolds: number;
    totalGrants: number;
    totalPayments: number;
    totalUsage: number;
  };
}

/**
 * Fetch the current session from BetterAuth `GET /api/auth/get-session`.
 * The response never contains the session token (redacted server-side).
 * Returns `null` when anonymous.
 */
export async function fetchSession(): Promise<GetSessionResponse | null> {
  try {
    const res = await fetch("/api/auth/get-session", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GetSessionResponse | null;
    if (!data?.user) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch Available Credits from `GET /api/credits`. Returns `null` when
 * anonymous or unverified (401/403).
 */
export async function fetchCredits(): Promise<number | null> {
  try {
    const res = await fetch("/api/credits", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GetCreditsResponse;
    if (data?.code !== 0 || typeof data.data?.available !== "number") return null;
    return data.data.available;
  } catch {
    return null;
  }
}

/**
 * Map a BetterAuth get-session response onto the shell's `Session` shape.
 */
export async function toShellSession(data: GetSessionResponse | null): Promise<Session> {
  if (!data) return getAnonymousSession();
  const { id, email, name, emailVerified, role } = data.user;
  const user: SessionUser = {
    ...deriveSessionUser({ id, name, email, role }),
    email: email ?? undefined,
    emailVerified: emailVerified ?? false,
    role: role ?? "user",
  };
  const credits = await fetchCredits();
  return { user, credits, loading: false };
}

export const SESSION_CHANGED_EVENT = "homedesign:session-changed";

export function triggerSessionRefresh(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT));
  }
}

/**
 * React hook the shell uses to read the current session.
 *
 * Real BetterAuth-backed implementation (ticket #03): polls on mount and
 * re-checks on window focus and session-changed events, per ADR 0001.
 */
export function useSession(): Session {
  const [session, setSession] = useState<Session>(() => ({
    user: null,
    credits: null,
    loading: true,
  }));

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const data = await fetchSession();
        if (!cancelled) {
          const shell = await toShellSession(data);
          setSession({ ...shell, loading: false });
        }
      } catch {
        if (!cancelled) {
          setSession((prev) => ({ ...prev, loading: false }));
        }
      }
    }

    void refresh();
    const onRefresh = () => void refresh();
    window.addEventListener("focus", onRefresh);
    window.addEventListener(SESSION_CHANGED_EVENT, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener(SESSION_CHANGED_EVENT, onRefresh);
    };
  }, []);

  return session;
}
