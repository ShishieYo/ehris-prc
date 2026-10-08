"use client";

import { btnClass } from "./button";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" className={btnClass("secondary")} onClick={() => window.print()}>
      {label}
    </button>
  );
}
