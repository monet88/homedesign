// Session stub for the application shell (ticket 02).
//
// Auth is ticket #03 (BetterAuth email + Google One Tap per ADR 0001). Until
// it lands, this stub drives the header's anonymous/logged-in states so the
// shell can be built and visually baselined now. Ticket #03 replaces the body
// of `useSession` with a real BetterAuth `GET /api/auth/get-session` fetch; the
// shape it returns is the contract the shell (Header) consumes.
//
// MUST NOT change: the shape of `Session` below — Header and the shell tests
// depend on it. Auth tickets extend `user` with the real fields, they do not
// reshape the anonymous/logged-in switch.

export interface SessionUser {
  /** Display name (falls back to email local-part). */
  name: string;
  /** Initial rendered in the avatar. */
  initial: string;
  /** Email, if the provider exposes it. */
  email?: string;
}

export interface Session {
  /** Non-null when the visitor is signed in. */
  user: SessionUser | null;
  /** Hook point for ticket #03: credit badge (Available Credits, spec US 12). */
  credits: number | null;
}

const ANONYMOUS: Session = { user: null, credits: null };

/**
 * Anonymous is the only state until BetterAuth lands (ticket #03). Return a
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

/**
 * React hook the shell uses to read the current session.
 *
 * Ticket #03 swaps this for a real fetch against BetterAuth
 * `GET /api/auth/get-session` (ADR 0001: JSON must never contain the session
 * token), polling on mount and on window focus. The returned `Session` shape
 * is the contract; keep it stable.
 */
export function useSession(): Session {
  return getAnonymousSession();
}
