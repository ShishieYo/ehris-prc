/** Lightweight, dependency-free charts (accessible: values are always listed as text). */

export function BarList({ items, unit = "" }: { items: { name: string; count: number }[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0) return <p className="text-sm text-slate-500">No data yet.</p>;
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{i.name}</span>
            <span className="font-medium text-slate-900">{i.count}{unit}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-brand-50" aria-hidden="true">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const PALETTE = ["#1c4479", "#386eb4", "#87afdd", "#b08a2e", "#5b7f95", "#8b9bb0", "#2f7d6d"];

export function Donut({ items, label }: { items: { name: string; count: number }[]; label: string }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  if (total === 0) return <p className="text-sm text-slate-500">No data yet.</p>;
  const r = 40;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90" role="img" aria-label={label}>
        {items.map((i, idx) => {
          const len = (i.count / total) * c;
          const el = (
            <circle key={i.name} cx="50" cy="50" r={r} fill="none" stroke={PALETTE[idx % PALETTE.length]} strokeWidth="16"
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />
          );
          offset += len;
          return el;
        })}
      </svg>
      <ul className="space-y-1 text-sm">
        {items.map((i, idx) => (
          <li key={i.name} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: PALETTE[idx % PALETTE.length] }} aria-hidden="true" />
            <span className="text-slate-700">{i.name}</span>
            <span className="font-medium text-slate-900">{i.count}</span>
            <span className="text-xs text-slate-500">({Math.round((i.count / total) * 100)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-2.5 overflow-hidden rounded-full bg-brand-100">
      <div className="h-full rounded-full bg-brand-700" style={{ width: `${percent}%` }} />
    </div>
  );
}
