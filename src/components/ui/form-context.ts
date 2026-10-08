"use client";

import { createContext, useContext } from "react";

/** Field-level validation messages from the last server action, keyed by input name. */
export const FormErrorsContext = createContext<Record<string, string>>({});

export const useFieldError = (name: string, explicit?: string) => {
  const ctx = useContext(FormErrorsContext);
  return explicit ?? ctx[name];
};
