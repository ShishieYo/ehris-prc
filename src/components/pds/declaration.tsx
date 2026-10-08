import type { Row } from "@/lib/db/types";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { saveDeclaration } from "@/app/(app)/pds/actions";

export function DeclarationCard({ employeeId, questions, answers, canEdit, number }: {
  employeeId: string; questions: Row<"pds_declaration_questions">[]; answers: Row<"pds_declaration_answers">[]; canEdit: boolean; number: number;
}) {
  return (
    <Card>
      <CardHeader title={`${number}. Declaration`} description="Answer every question. Give details for any Yes." />
      <CardBody>
        {canEdit ? (
          <ActionForm action={saveDeclaration}>
            <input type="hidden" name="employee_id" value={employeeId} />
            <ul className="space-y-4">
              {questions.map((q) => {
                const a = answers.find((x) => x.question_code === q.code);
                return (
                  <li key={q.code} className="rounded-md border border-line p-3">
                    <p className="text-sm font-medium text-slate-900">{q.label}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                      <label className="flex items-center gap-1"><input type="radio" name={`answer_${q.code}`} value="no" defaultChecked={!a || !a.answer} /> No</label>
                      <label className="flex items-center gap-1"><input type="radio" name={`answer_${q.code}`} value="yes" defaultChecked={!!a?.answer} /> Yes</label>
                      <input aria-label={`Details for ${q.label}`} name={`details_${q.code}`} defaultValue={a?.details ?? ""} placeholder="Details (if Yes)" className="min-w-48 flex-1 rounded-md border border-slate-300 px-2 py-1" />
                    </div>
                  </li>
                );
              })}
            </ul>
            <SubmitButton>Save declaration</SubmitButton>
          </ActionForm>
        ) : (
          <ul className="space-y-2 text-sm">
            {questions.map((q) => {
              const a = answers.find((x) => x.question_code === q.code);
              return <li key={q.code}>{q.label}: <strong>{a ? (a.answer ? `Yes — ${a.details ?? ""}` : "No") : "Not answered"}</strong></li>;
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">Declaration wording is maintained by HR and must follow the current CSC Form 212 revision.</p>
      </CardBody>
    </Card>
  );
}
