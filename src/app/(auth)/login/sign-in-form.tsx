"use client";

import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/form";
import { signIn } from "./actions";

export function SignInForm({ next }: { next: string }) {
  return (
    <ActionForm action={signIn}>
      <input type="hidden" name="next" value={next} />
      <TextField label="Email address" name="email" type="email" autoComplete="username" required />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
    </ActionForm>
  );
}
