"use client";

import { createContext, useContext } from "react";

/** Field-level validation messages from the last server action, keyed by input name. */
export const FormErrorsContext = createContext<Record<string, string>>({});

/**
 * Values the user submitted when the last action failed. React resets uncontrolled
 * inputs after every action; restoring these keeps long forms from being wiped by
 * a validation error. `__submitted` marks that a submission happened (needed for checkboxes).
 */
export const FormValuesContext = createContext<Record<string, string>>({});

export const useFieldError = (name: string, explicit?: string) => {
  const ctx = useContext(FormErrorsContext);
  return explicit ?? ctx[name];
};

/** Submitted value for a text-like field, falling back to the page-provided default. */
export const useFieldValue = <T,>(name: string, fallback: T): T | string => {
  const values = useContext(FormValuesContext);
  return name in values ? values[name] : fallback;
};

export const useCheckedValue = (name: string, fallback: boolean | undefined): boolean | undefined => {
  const values = useContext(FormValuesContext);
  return values.__submitted ? name in values : fallback;
};
