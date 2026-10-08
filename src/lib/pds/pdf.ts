import "server-only";
import type { Row } from "@/lib/db/types";
import type { PdsData } from "@/lib/data/pds";
import { PDS_SECTIONS } from "@/lib/pds/sections";
import { PdfReport } from "@/lib/reports/pdf";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";

/** System-generated summary of the electronic PDS (not the official CSC Form 212). */
export async function buildPdsPdf(args: {
  employee: Row<"employees">;
  priv: Row<"employee_private"> | null;
  pds: PdsData;
  generatedBy: string;
}): Promise<Uint8Array> {
  const { employee: e, priv, pds } = args;
  const name = [e.first_name, e.middle_name, e.last_name, e.extension_name].filter(Boolean).join(" ");
  const r = await PdfReport.create({
    title: "Personal Data Sheet — Electronic Summary",
    subtitle: `${name} · ${e.employee_no}`,
    footer: `PRC Region III eHRIS · CONFIDENTIAL personal data · Generated ${fmtDateTime(new Date())} by ${args.generatedBy}`,
  });
  r.write("System-generated from the electronic PDS. This is not the official CSC Form 212 until validated by HR and signed by the employee.", { size: 8 });

  r.heading("1. Personal information");
  r.keyValues([
    ["Name", name], ["Employee ID", e.employee_no],
    ["Date of birth", priv ? fmtDate(priv.birth_date) : "Restricted"], ["Place of birth", priv?.birth_place],
    ["Sex", e.sex ? titleCase(e.sex) : null], ["Civil status", priv?.civil_status ? titleCase(priv.civil_status) : null],
    ["Citizenship", priv?.citizenship], ["Mobile", priv?.mobile_no],
  ]);

  PDS_SECTIONS.forEach((def, i) => {
    r.heading(`${i + 2}. ${def.title}`);
    const fields = def.fields.filter((f) => f.list);
    r.table(
      fields.map((f) => f.label),
      pds.sections[def.key].map((row) =>
        fields.map((f) => {
          const v = row[f.name];
          if (v == null || v === "") return "";
          if (f.type === "date") return fmtDate(String(v));
          if (f.type === "select") return f.options?.find((o) => o.value === v)?.label ?? String(v);
          return String(v);
        }),
      ),
    );
  });

  r.heading(`${PDS_SECTIONS.length + 2}. Declaration`);
  r.table(
    ["Question", "Answer", "Details"],
    pds.questions.map((q) => {
      const a = pds.answers.find((x) => x.question_code === q.code);
      return [q.label, a ? (a.answer ? "Yes" : "No") : "Not answered", a?.details ?? ""];
    }),
    [5, 1, 3],
  );

  r.heading("Certification and verification");
  r.table(["Event", "By", "When", "Remarks"], [...pds.submissions].reverse().map((s) => [titleCase(s.kind), s.by_name, fmtDateTime(s.created_at), s.remarks ?? ""]), [1, 2, 2, 3]);
  return r.save();
}
