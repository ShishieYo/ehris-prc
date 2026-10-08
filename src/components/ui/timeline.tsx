import type { ReactNode } from "react";
import { fmtDate, fmtTime } from "@/lib/format";

export type TimelineEntry = {
  key: string | number;
  title: string;
  at: string;
  by: string;
  remarks?: string | null;
  tone?: "done" | "reject" | "info";
};

const dot = { done: "bg-emerald-600", reject: "bg-red-600", info: "bg-brand-600" };

/** Vertical timeline: each step shows date, time, user, action and remarks. */
export function Timeline({ entries, empty }: { entries: TimelineEntry[]; empty?: ReactNode }) {
  if (entries.length === 0) return <p className="text-sm text-slate-500">{empty ?? "No activity yet."}</p>;
  return (
    <ol className="relative ml-2 border-l-2 border-brand-100">
      {entries.map((e) => (
        <li key={e.key} className="relative pb-6 pl-6 last:pb-0">
          <span className={`absolute -left-[9px] top-1.5 h-4 w-4 rounded-full ring-4 ring-white ${dot[e.tone ?? "info"]}`} aria-hidden="true" />
          <p className="font-medium text-slate-900">{e.title}</p>
          <p className="text-xs text-slate-500">
            <time dateTime={e.at}>{fmtDate(e.at)} · {fmtTime(e.at)}</time> · {e.by}
          </p>
          {e.remarks && <p className="mt-1 rounded-md bg-slate-50 px-3 py-1.5 text-sm text-slate-700">{e.remarks}</p>}
        </li>
      ))}
    </ol>
  );
}

/** Horizontal progress tracker for a configured workflow (done / current / upcoming). */
export function StepTracker({ steps, currentOrder, finished, failed }: { steps: { order: number; name: string }[]; currentOrder: number | null; finished: boolean; failed?: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm" aria-label="Workflow progress">
      <li className="flex items-center gap-2">
        <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-medium text-white">Submitted</span>
      </li>
      {steps.map((s) => {
        const state = failed && currentOrder === null && !finished ? "idle" : finished || (currentOrder !== null && s.order < currentOrder) ? "done" : s.order === currentOrder ? "current" : "idle";
        const cls = state === "done" ? "bg-emerald-600 text-white" : state === "current" ? "bg-brand-700 text-white ring-2 ring-brand-300" : "bg-slate-200 text-slate-600";
        return (
          <li key={s.order} className="flex items-center gap-2">
            <span aria-hidden="true" className="text-slate-400">→</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`} aria-current={state === "current" ? "step" : undefined}>
              {s.name}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
