"use client";

import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/form";
import { updatePassword } from "./actions";

export function ResetForm() {
  return (
    <ActionForm action={updatePassword}>
      <TextField label="New password" name="password" type="password" autoComplete="new-password" required />
      <TextField label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
      <SubmitButton pendingText="Saving…">Update password</SubmitButton>
    </ActionForm>
  );
}
