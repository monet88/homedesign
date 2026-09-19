"use client";

import { createAuthClient } from "better-auth/react";

import { triggerSessionRefresh } from "@/lib/auth/session-stub";

const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
});

export async function signInWithGoogle(callbackURL = "/"): Promise<void> {
  const result = await authClient.signIn.social({
    provider: "google",
    callbackURL,
  });
  if (result.error) {
    throw new Error(result.error.message || "GOOGLE_SIGN_IN_FAILED");
  }
  if (result.data?.url && typeof window !== "undefined") {
    window.location.href = result.data.url;
  }
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
  triggerSessionRefresh();
  window.location.href = "/";
}

export { authClient };
