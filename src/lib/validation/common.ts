import { z } from "zod";

/** Blank form inputs become null; otherwise the trimmed string. */
export const optText = (max = 200) =>
  z.string().trim().max(max, `Use at most ${max} characters.`).transform((v) => (v === "" ? null : v));

export const reqText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `Use at most ${max} characters.`);

export const optDate = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), "Enter a valid date.")
  .transform((v) => (v === "" ? null : v));

export const reqDate = (label: string) =>
  z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} is required.`).refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date.");

export const optInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int("Use a whole number.").min(min, `Minimum is ${min}.`).max(max, `Maximum is ${max}.`).nullable());

export const optNumber = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().min(min, `Minimum is ${min}.`).max(max, `Maximum is ${max}.`).nullable());

export const optUuid = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.uuid("Choose a valid option.").nullable());

export const optCode = z.string().trim().transform((v) => (v === "" ? null : v));

/** Plain FormData -> object (single values). Files and multi-value fields are handled by their own actions. */
export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  return out;
}
