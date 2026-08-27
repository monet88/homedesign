"use client";

import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
});

export async function signOut(): Promise<void> {
  await authClient.signOut();
  window.location.href = "/";
}

export { authClient };
