import { Badge } from "./primitives";

type EntityKind = "leave_application" | "attendance_correction" | "hr_request";

const BASE: Record<string, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  draft: { label: "Draft", tone: "neutral" },
  in_review: { label: "In review", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  completed: { label: "Completed", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** Label shown to people for a request status (kept in one place). */
export function requestStatusLabel(status: string, kind?: EntityKind): string {
  if (status === "completed" && kind === "attendance_correction") return "Approved · DTR updated";
  if (status === "approved" && kind === "leave_application") return "Approved";
  if (status === "completed" && kind === "hr_request") return "Released";
  return BASE[status]?.label ?? status;
}

export function RequestStatusBadge({ status, kind, step }: { status: string; kind?: EntityKind; step?: string | null }) {
  const b = BASE[status] ?? { label: status, tone: "neutral" as const };
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={b.tone}>{requestStatusLabel(status, kind)}</Badge>
      {step && (status === "in_review" || status === "approved") && <span className="text-xs text-slate-500">{step}</span>}
    </span>
  );
}

const ATT: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  PRESENT: "success", LATE: "warning", UNDERTIME: "warning", MISSING_LOG: "danger", ABSENT: "danger",
  OB: "info", OT: "info", LEAVE: "info", WFH: "info", HOLIDAY: "neutral", OTHER: "neutral",
};

export function AttendanceBadge({ code, name }: { code: string; name: string }) {
  return <Badge tone={ATT[code] ?? "neutral"}>{name}</Badge>;
}

const DOC: Record<string, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  for_review: { label: "For review", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  archived: { label: "Archived", tone: "neutral" },
};

export function DocumentStatusBadge({ status, deleted }: { status: string; deleted?: boolean }) {
  if (deleted) return <Badge tone="danger">Deleted</Badge>;
  const d = DOC[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={d.tone}>{d.label}</Badge>;
}
