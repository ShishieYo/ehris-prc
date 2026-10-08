import { ResetForm } from "./reset-form";

export default function ResetPasswordPage() {
  return (
    <div className="rounded-lg bg-white p-6 shadow-lg">
      <h1 className="text-xl font-semibold text-brand-900">Choose a new password</h1>
      <p className="mb-4 text-sm text-slate-600">Use at least 12 characters with upper-case, lower-case and a number.</p>
      <ResetForm />
    </div>
  );
}
