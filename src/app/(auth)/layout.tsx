import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand";
import { isDemoMode } from "@/lib/env";

// These pages must be rendered per request: the Content-Security-Policy nonce is
// generated per request (see src/proxy.ts) and cannot be applied to static HTML,
// and the demo banner depends on runtime configuration.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-900 to-brand-700">
      {isDemoMode() && (
        <div role="status" className="bg-amber-400 px-4 py-1.5 text-center text-xs font-bold tracking-widest text-amber-950">
          DEMO ENVIRONMENT — FICTIONAL DATA ONLY
        </div>
      )}
      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <div className="mb-6 flex items-center gap-3 text-white">
          <BrandMark size={44} />
          <div>
            <p className="text-lg font-semibold leading-tight">PRC Region III eHRIS</p>
            <p className="text-xs text-brand-100">Electronic Human Resource Information System</p>
          </div>
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-brand-200">
          Authorized personnel only. Activity is logged. This is an internal system, not the official PRC website.
        </p>
      </main>
    </div>
  );
}
