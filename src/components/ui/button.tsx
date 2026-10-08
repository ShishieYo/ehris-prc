import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

export function btnClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
  const sizes = { sm: "px-2.5 py-1 text-sm", md: "px-4 py-2 text-sm" }[size];
  const variants = {
    primary: "bg-brand-700 text-white hover:bg-brand-800",
    secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    danger: "bg-red-700 text-white hover:bg-red-800",
    ghost: "text-brand-700 hover:bg-brand-50",
  }[variant];
  return `${base} ${sizes} ${variants} ${extra}`;
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={btnClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={btnClass(variant, size, className)} {...props} />;
}

/**
 * Plain anchor styled as a button, for downloads and generated files.
 * Never use <Link> for these: Next.js prefetches Links, which would trigger the
 * file route (and its audit logging) without the user asking for the file.
 */
export function FileLinkButton({ variant, size, className, ...props }: ComponentProps<"a"> & { variant?: Variant; size?: Size }) {
  return <a className={btnClass(variant, size, className)} {...props} />;
}
