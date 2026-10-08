import { SignInForm } from "./sign-in-form";
import { isDemoMode } from "@/lib/env";
import { Alert } from "@/components/ui/primitives";
import Link from "next/link";

const REASONS: Record<string, string> = {
  timeout: "You were signed out because of inactivity.",
  expired: "Your session expired. Please sign in again.",
  "link-invalid": "That link is invalid or has expired. Request a new one.",
  "signed-out": "You have been signed out.",
};

const DEMO_ACCOUNTS: [string, string][] = [
  ["juan.delacruz@demo.prc3.example", "Employee"],
  ["analiza.bautista@demo.prc3.example", "Employee (another)"],
  ["lorna.dizon@demo.prc3.example", "Supervisor"],
  ["paolo.mercado@demo.prc3.example", "HR Staff"],
  ["teresita.navarro@demo.prc3.example", "HR Admin"],
  ["ricardo.villanueva@demo.prc3.example", "Regional Director"],
  ["eduardo.pascual@demo.prc3.example", "Auditor"],
  ["admin@demo.prc3.example", "Super Admin"],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string; next?: string }> }) {
  const { reason, next } = await searchParams;
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-6 shadow-lg">
        <h1 className="text-xl font-semibold text-brand-900">Sign in</h1>
        <p className="mb-4 text-sm text-slate-600">Digitalizing Personnel Records, HR Services, and Workforce Management</p>
        {reason && REASONS[reason] && <div className="mb-4"><Alert tone="warning">{REASONS[reason]}</Alert></div>}
        <SignInForm next={next ?? ""} />
        <p className="mt-4 text-sm">
          <Link href="/forgot-password" className="text-brand-700 underline">Forgot your password?</Link>
          {" · "}
          <Link href="/privacy" className="text-brand-700 underline">Privacy notice</Link>
        </p>
      </div>
      {isDemoMode() && (
        <div className="rounded-lg bg-white/95 p-4 text-sm shadow">
          <p className="font-semibold text-amber-900">Demo accounts (password: see README → Demo environment)</p>
          <ul className="mt-2 space-y-0.5 text-slate-700">
            {DEMO_ACCOUNTS.map(([email, role]) => (
              <li key={email}><span className="font-mono text-xs">{email}</span> — {role}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
