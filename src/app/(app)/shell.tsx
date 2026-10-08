"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { BrandMark } from "@/components/brand";
import type { NavItem } from "@/lib/nav";
import { signOut } from "@/app/actions/session";

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((i) => {
        const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
        return (
          <li key={i.href}>
            <Link
              href={i.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-white/15 text-white" : "text-brand-100 hover:bg-white/10 hover:text-white"}`}
            >
              <Icon name={i.icon} />
              <span className="flex-1">{i.label}</span>
              {!!i.badge && (
                <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950" aria-label={`${i.badge} pending`}>
                  {i.badge}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Signs the user out after a period without interaction (complements the proxy's server-side check). */
function IdleGuard({ minutes }: { minutes: number }) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => form.current?.requestSubmit(), minutes * 60_000);
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);
  return (
    <form ref={form} action={signOut} className="hidden">
      <input type="hidden" name="reason" value="timeout" />
    </form>
  );
}

export function AppShell({ primary, manage, user, idleMinutes, demo, children }: {
  primary: NavItem[]; manage: NavItem[]; user: { name: string; roles: string }; idleMinutes: number; demo: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to main content
      </a>
      {open && <button aria-label="Close menu" className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={close} />}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand-900 transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-3 px-4 py-4">
          <BrandMark />
          <div className="leading-tight text-white">
            <p className="text-sm font-semibold">PRC Region III</p>
            <p className="text-xs text-brand-200">eHRIS</p>
          </div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          <NavLinks items={primary} onNavigate={close} />
          {manage.length > 0 && (
            <div>
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-brand-300">Management</p>
              <NavLinks items={manage} onNavigate={close} />
            </div>
          )}
        </nav>
        <div className="border-t border-white/10 p-3">
          <p className="truncate px-1 text-sm font-medium text-white">{user.name}</p>
          <p className="truncate px-1 text-xs text-brand-200">{user.roles}</p>
          <form action={signOut} className="mt-2">
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-brand-100 hover:bg-white/10 hover:text-white">
              <Icon name="logout" className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {demo && (
          <div role="status" className="bg-amber-400 px-4 py-1 text-center text-xs font-bold tracking-widest text-amber-950">
            DEMO ENVIRONMENT — FICTIONAL DATA ONLY
          </div>
        )}
        <header className="no-print flex items-center gap-3 border-b border-line bg-white px-4 py-3">
          <button className="rounded-md border border-slate-300 p-1.5 lg:hidden" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <Icon name="menu" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-brand-900">PRC Region III</p>
            <p className="truncate text-xs text-slate-500">Electronic Human Resource Information System</p>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
        <footer className="no-print border-t border-line px-6 py-3 text-xs text-slate-500">
          Internal system — authorized personnel only. All activity is logged. <Link className="underline" href="/privacy">Privacy notice</Link>
        </footer>
      </div>
      <IdleGuard minutes={idleMinutes} />
    </div>
  );
}
