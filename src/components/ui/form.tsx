"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFieldError } from "./form-context";

const control =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 disabled:bg-slate-100";

function Wrap({ id, label, hint, error, required, children }: { id: string; label: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
        {label}
        {required && <span aria-hidden="true" className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

type Common = { label: string; hint?: string; error?: string };

export function TextField({ label, hint, error, id, name, required, ...rest }: Common & ComponentProps<"input"> & { name: string }) {
  const fid = id ?? `f-${name}`;
  error = useFieldError(name, error);
  return (
    <Wrap id={fid} label={label} hint={hint} error={error} required={required}>
      <input id={fid} name={name} required={required} aria-invalid={!!error} aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined} className={control} {...rest} />
    </Wrap>
  );
}

export function TextAreaField({ label, hint, error, id, name, required, ...rest }: Common & ComponentProps<"textarea"> & { name: string }) {
  const fid = id ?? `f-${name}`;
  error = useFieldError(name, error);
  return (
    <Wrap id={fid} label={label} hint={hint} error={error} required={required}>
      <textarea id={fid} name={name} required={required} rows={3} aria-invalid={!!error} aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined} className={control} {...rest} />
    </Wrap>
  );
}

export type Option = { value: string; label: string };

export function SelectField({ label, hint, error, id, name, required, options, placeholder, ...rest }: Common & ComponentProps<"select"> & { name: string; options: Option[]; placeholder?: string }) {
  const fid = id ?? `f-${name}`;
  error = useFieldError(name, error);
  return (
    <Wrap id={fid} label={label} hint={hint} error={error} required={required}>
      <select id={fid} name={name} required={required} aria-invalid={!!error} aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined} className={control} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Wrap>
  );
}

export function CheckboxField({ label, name, ...rest }: { label: string; name: string } & ComponentProps<"input">) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-800">
      <input type="checkbox" name={name} className="h-4 w-4 rounded border-slate-300 text-brand-700" {...rest} />
      {label}
    </label>
  );
}

export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const c = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" }[cols];
  return <div className={`grid gap-4 ${c}`}>{children}</div>;
}
