import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <div className="rounded-lg bg-white p-6 shadow-lg">
      <h1 className="text-xl font-semibold text-brand-900">Reset your password</h1>
      <p className="mb-4 text-sm text-slate-600">Enter your official email address. If an account exists, we&apos;ll send a reset link.</p>
      <ForgotForm />
      <p className="mt-4 text-sm"><Link href="/login" className="text-brand-700 underline">Back to sign in</Link></p>
    </div>
  );
}
