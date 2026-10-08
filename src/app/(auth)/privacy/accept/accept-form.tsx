"use client";

import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CheckboxField } from "@/components/ui/form";
import { acceptPrivacy, signOut } from "@/app/actions/session";

export function AcceptForm() {
  return (
    <>
      <ActionForm action={acceptPrivacy} className="mt-6 space-y-4 border-t border-line pt-4">
        <CheckboxField name="agree" label="I have read this notice and will use this system only for my official duties." required />
        <SubmitButton>Acknowledge and continue</SubmitButton>
      </ActionForm>
      <form action={signOut} className="mt-3">
        <button className="text-sm text-slate-600 underline">Cancel and sign out</button>
      </form>
    </>
  );
}
