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
  /** Display name (falls back to email local-part). */
  name: string;
  /** Initial rendered in the avatar. */
  initial: string;
  /** Email, if the provider exposes it. */
  email?: string;
  /** Server-verified email flag (ADR 0001 gate). */
  emailVerified?: boolean;
}

export interface Session {
  /** Non-null when the visitor is signed in. */
  user: SessionUser | null;
  /** Hook point for ticket #03: credit badge (Available Credits, spec US 12). */
  credits: number | null;
}

const ANONYMOUS: Session = { user: null, credits: null };

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
  name?: string | null;
  email?: string | null;
}): SessionUser {
  const name = input.name?.trim() || input.email?.trim() || "Guest";
  const initial = (name[0] ?? "G").toUpperCase();
  return { name, initial, email: input.email ?? undefined };
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
    image?: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

/**
 * Fetch the current session from BetterAuth `GET /api/auth/get-session`.
 * The response never contains the session token (redacted server-side).
 * Returns `null` when anonymous.
 */
export async function fetchSession(): Promise<GetSessionResponse | null> {
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
}

/**
 * Map a BetterAuth get-session response onto the shell's `Session` shape.
 */
export function toShellSession(data: GetSessionResponse | null): Session {
  if (!data) return getAnonymousSession();
  const { email, name, emailVerified } = data.user;
  const user: SessionUser = {
    ...deriveSessionUser({ name, email }),
    email: email ?? undefined,
    emailVerified: emailVerified ?? false,
  };
  return { user, credits: null };
}

/**
 * React hook the shell uses to read the current session.
 *
 * Real BetterAuth-backed implementation (ticket #03): polls on mount and
 * re-checks on window focus, per ADR 0001 `GET /api/auth/get-session`.
 */
export function useSession(): Session {
  const [session, setSession] = useState<Session>(getAnonymousSession);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const data = await fetchSession();
      if (!cancelled) setSession(toShellSession(data));
    }

    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return session;
}
