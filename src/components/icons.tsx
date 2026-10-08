/** Minimal inline icon set (24x24, stroke). Decorative: always aria-hidden. */
const PATHS: Record<string, string> = {
  dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6m2 15a5 5 0 0 0-3-4.6",
  form: "M6 3h9l4 4v14H6V3Zm8 0v5h5M9 12h7M9 16h7",
  record: "M5 4h14v16H5V4Zm3 4h8M8 12h8M8 16h5",
  folder: "M3 6h6l2 2h10v11H3V6Z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2",
  calendar: "M4 6h16v14H4V6Zm0 5h16M8 3v4m8-4v4",
  inbox: "M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5",
  bell: "M6 17V11a6 6 0 1 1 12 0v6l2 2H4l2-2Zm4 4h4",
  chart: "M5 20V10m5 10V4m5 16v-7m5 7H3",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z",
  cog: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-3 2-1-1-3-2 .5a7 7 0 0 0-2-1.2L15 5h-3l-1 2.3a7 7 0 0 0-2 1.2L7 8 5 11l1 1-1 1 2 3 2-.5a7 7 0 0 0 2 1.2L12 19h3l1-2.3a7 7 0 0 0 2-1.2l2 .5 1-3-1-1Z",
  check: "M5 12l4 4 10-10",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M5 20h14",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 3-4-4",
  menu: "M4 6h16M4 12h16M4 18h16",
  logout: "M10 4H5v16h5m4-4 4-4-4-4m4 4H9",
  quality: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  import: "M12 3v12m0 0-4-4m4 4 4-4M4 21h16",
  audit: "M7 3h10v18H7V3Zm3 5h4m-4 4h4m-4 4h2",
};

export function Icon({ name, className = "h-5 w-5" }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name] ?? PATHS.record} />
    </svg>
  );
}
