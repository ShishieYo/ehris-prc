"use client";

/**
 * Last-resort error screen. Technical details never reach the user: Next.js
 * replaces server error messages in production, and we only show the
 * (non-sensitive) digest as a reference for support.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4">
      <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-brand-900">We couldn&apos;t complete this request</h1>
        <p className="mt-2 text-sm text-slate-600">Please try again or contact HR Support.</p>
        {error.digest && <p className="mt-2 text-xs text-slate-500">Reference: {error.digest}</p>}
        <div className="mt-4 flex gap-3">
          <button onClick={reset} className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">Try again</button>
          <a href="/dashboard" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">Go to dashboard</a>
        </div>
      </div>
    </main>
  );
}
