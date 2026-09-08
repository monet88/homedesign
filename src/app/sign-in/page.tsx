"use client";

import Link from "next/link";
import { useState } from "react";
import { signInWithGoogle } from "@/lib/auth/client";

export default function SignInPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setPending(true);
    setError(null);
    try {
      await signInWithGoogle("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start Google sign-in.");
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4 py-16 sm:px-6">
      <section className="w-full rounded-3xl border border-foreground/10 bg-background p-8 text-center shadow-sm">
        <p className="text-sm font-medium text-foreground/60">HomeDesign</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-foreground/65">
          Continue with Google to access your projects, credits, and design tools.
        </p>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={pending}
          className="mt-7 w-full rounded-pill bg-brand-forest px-5 py-3 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Opening Google..." : "Continue with Google"}
        </button>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <Link href="/" className="mt-6 inline-block text-sm font-medium text-foreground/60 hover:text-foreground">
          Back to HomeDesign
        </Link>
      </section>
    </main>
  );
}
