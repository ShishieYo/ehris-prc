import "server-only";
import type { Ctx } from "@/lib/auth/session";
import type { Row } from "@/lib/db/types";
import { PDS_SECTIONS, type SectionDef } from "@/lib/pds/sections";

export type PdsData = {
  sections: Record<string, Record<string, unknown>[]>;
  questions: Row<"pds_declaration_questions">[];
  answers: Row<"pds_declaration_answers">[];
  submissions: Row<"pds_submissions">[];
};

export async function getPds(ctx: Ctx, employeeId: string): Promise<PdsData> {
  const lists = await Promise.all(
    PDS_SECTIONS.map((s: SectionDef) =>
      ctx.db.from(s.table).select("*").eq("employee_id", employeeId).order("sort_order").order("created_at"),
    ),
  );
  const [questions, answers, submissions] = await Promise.all([
    ctx.db.from("pds_declaration_questions").select("*").eq("is_active", true).order("sort_order"),
    ctx.db.from("pds_declaration_answers").select("*").eq("employee_id", employeeId),
    ctx.db.from("pds_submissions").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false }),
  ]);
  for (const r of [...lists, questions, answers, submissions]) if (r.error) throw r.error;
  return {
    sections: Object.fromEntries(PDS_SECTIONS.map((s, i) => [s.key, (lists[i].data ?? []) as Record<string, unknown>[]])),
    questions: questions.data ?? [],
    answers: answers.data ?? [],
    submissions: submissions.data ?? [],
  };
}

/** Latest certification/verification state for display. */
export function pdsState(submissions: Row<"pds_submissions">[]): { label: string; tone: "neutral" | "info" | "success" | "warning" } {
  const latest = submissions[0];
  if (!latest) return { label: "Not yet certified", tone: "neutral" };
  if (latest.kind === "verified") return { label: "Verified by HR", tone: "success" };
  if (latest.kind === "returned") return { label: "Returned for correction", tone: "warning" };
  return { label: "Certified — awaiting HR verification", tone: "info" };
}
