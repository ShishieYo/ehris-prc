import Link from "next/link";

export function Tabs({ items, active }: { items: { href: string; label: string; key: string; hidden?: boolean }[]; active: string }) {
  return (
    <nav aria-label="Sections" className="no-print mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {items.filter((i) => !i.hidden).map((i) => (
        <Link key={i.key} href={i.href} aria-current={i.key === active ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${i.key === active ? "border-brand-700 text-brand-800" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function Pagination({ basePath, params, page, pageSize, total }: { basePath: string; params: Record<string, string | undefined>; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("page", String(p));
    return `${basePath}?${q.toString()}`;
  };
  return (
    <nav aria-label="Pagination" className="no-print flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <span className="text-slate-600">Page {page} of {pages} · {total} records</span>
      <span className="flex gap-2">
        {page > 1 && <Link className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50" href={href(page - 1)}>Previous</Link>}
        {page < pages && <Link className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50" href={href(page + 1)}>Next</Link>}
      </span>
    </nav>
  );
}
