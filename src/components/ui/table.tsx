import type { ComponentProps, ReactNode } from "react";

/** Responsive, accessible table: horizontally scrollable on small screens, with a screen-reader caption. */
export function Table({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={caption}>
      <table className="min-w-full divide-y divide-line text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export const THead = ({ children }: { children: ReactNode }) => (
  <thead className="bg-slate-50">
    <tr>{children}</tr>
  </thead>
);

export function Th({ children, className = "", ...rest }: ComponentProps<"th">) {
  return (
    <th scope="col" className={`whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 ${className}`} {...rest}>
      {children}
    </th>
  );
}

export const TBody = ({ children }: { children: ReactNode }) => <tbody className="divide-y divide-line bg-white">{children}</tbody>;

export function Td({ children, className = "", ...rest }: ComponentProps<"td">) {
  return (
    <td className={`px-3 py-2 align-top text-slate-800 ${className}`} {...rest}>
      {children}
    </td>
  );
}
