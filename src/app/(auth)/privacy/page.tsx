import Link from "next/link";
import { PRIVACY_NOTICE } from "@/content/privacy";

export const metadata = { title: "Privacy Notice — PRC Region III eHRIS" };

export default function PrivacyPage() {
  return (
    <article className="rounded-lg bg-white p-6 shadow-lg">
      <h1 className="text-xl font-semibold text-brand-900">{PRIVACY_NOTICE.title}</h1>
      <p className="mt-2 text-sm text-slate-700">{PRIVACY_NOTICE.intro}</p>
      {PRIVACY_NOTICE.sections.map((s) => (
        <section key={s.heading} className="mt-4">
          <h2 className="font-semibold text-slate-900">{s.heading}</h2>
          <p className="text-sm text-slate-700">{s.body}</p>
        </section>
      ))}
      <p className="mt-6 text-sm"><Link className="text-brand-700 underline" href="/login">Back to sign in</Link></p>
    </article>
  );
}
