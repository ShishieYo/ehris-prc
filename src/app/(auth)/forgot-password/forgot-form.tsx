"use client";

import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/form";
import { requestReset } from "./actions";

export function ForgotForm() {
  return (
    <ActionForm action={requestReset}>
      <TextField label="Email address" name="email" type="email" autoComplete="username" required />
      <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
    </ActionForm>
  );
}
