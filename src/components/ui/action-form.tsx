"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "./primitives";
import { btnClass } from "./button";
import type { ActionState } from "@/lib/errors";
import { FormErrorsContext } from "./form-context";

export function SubmitButton({ children, variant = "primary", size = "md", pendingText = "Working…", confirm, name, value }: {
  children: ReactNode; variant?: "primary" | "secondary" | "danger" | "ghost"; size?: "sm" | "md"; pendingText?: string; confirm?: string; name?: string; value?: string;
}) {
  const { pending, data } = useFormStatus();
  // With several submit buttons, only the one that was pressed shows the pending label.
  const mine = pending && (!name || data?.get(name) === value);
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={btnClass(variant, size)}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {mine ? pendingText : children}
    </button>
  );
}

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Form wired to a server action. Shows a friendly error (never a stack trace)
 * and a success message; field-level errors reach the inputs through context.
 */
export function ActionForm({ action, children, className, resetOnSuccess }: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form ref={ref} action={formAction} className={className ?? "space-y-4"} noValidate={false}>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <FormErrorsContext.Provider value={errors}>{children}</FormErrorsContext.Provider>
    </form>
  );
}

/** Small inline form for row actions (approve, delete, mark read…). */
export function InlineAction({ action, children, hidden = {}, className = "inline" }: {
  action: (formData: FormData) => Promise<void>;
  children: ReactNode;
  hidden?: Record<string, string>;
  className?: string;
}) {
  return (
    <form action={action} className={className}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
    </form>
  );
}
