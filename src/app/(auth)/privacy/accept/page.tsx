import { redirect } from "next/navigation";
import { getCtx } from "@/lib/auth/session";
import { PRIVACY_NOTICE } from "@/content/privacy";
import { AcceptForm } from "./accept-form";

export default async function AcceptPrivacyPage() {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  if (ctx.privacyOk) redirect("/dashboard");
  return (
    <article className="rounded-lg bg-white p-6 shadow-lg">
      <h1 className="text-xl font-semibold text-brand-900">{PRIVACY_NOTICE.title}</h1>
      <p className="mt-2 text-sm text-slate-700">{PRIVACY_NOTICE.intro}</p>
      {PRIVACY_NOTICE.sections.map((s) => (
        <section key={s.heading} className="mt-3">
          <h2 className="font-semibold text-slate-900">{s.heading}</h2>
          <p className="text-sm text-slate-700">{s.body}</p>
        </section>
      ))}
      <AcceptForm />
    </article>
  );
}
