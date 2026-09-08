import Link from "next/link";

/**
 * Server-rendered unauthorized / forbidden screen for the Admin Panel.
 * Rendered when the server-side auth check in page.tsx determines the
 * visitor is anonymous (401) or a non-admin user (403).
 *
 * This component never ships dashboard markup to unauthorized users.
 */
export default function AdminUnauthorized({ status }: { status: 401 | 403 }) {
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
        <h1 className="text-2xl font-bold text-ink">
          {status === 401 ? "401 Unauthorized" : "403 Forbidden"}
        </h1>
        <p className="mt-2 text-sm text-ink/70">
          Access to the Administrator Operations Panel is restricted. Please sign in with an authorized administrator account.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <Link
            href="/sign-in"
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
