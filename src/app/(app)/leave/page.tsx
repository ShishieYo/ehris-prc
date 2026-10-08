import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { getDirectoryEntry } from "@/lib/data/employees";
import { Card, CardBody, CardHeader, EmptyState, NoAccess, PageHeader } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { RequestStatusBadge } from "@/components/ui/status";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { FormGrid, SelectField, TextField } from "@/components/ui/form";
import { BalanceCards } from "@/components/leave/balance-cards";
import { saveBalance } from "./actions";
import { fmtDate, fmtNumber, todayManila } from "@/lib/format";

export const metadata: Metadata = { title: "Leave" };

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ employee?: string; year?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const employeeId = sp.employee ?? ctx.employeeId;
  if (!employeeId) return <NoAccess />;
  const isSelf = employeeId === ctx.employeeId;
  const year = Number(sp.year) || Number(todayManila().slice(0, 4));
  const [lookups, person, balances, apps] = await Promise.all([
    getLookups(ctx),
    getDirectoryEntry(ctx, employeeId),
    ctx.db.from("leave_balance_summary").select("*").eq("employee_id", employeeId).eq("year", year).order("leave_type_code"),
    ctx.db.from("leave_applications").select("*").eq("employee_id", employeeId).order("date_from", { ascending: false }).limit(50),
  ]);
  if (balances.error) throw balances.error;
  if (apps.error) throw apps.error;
  if (!isSelf && !person) return <NoAccess />;
  const typeName = (c: string) => lookups.leaveTypes.find((t) => t.code === c)?.name ?? c;

  return (
    <>
      <PageHeader
        title={isSelf ? "My Leave" : `Leave — ${person?.full_name}`}
        description={`Balances for ${year}. Available = beginning + earned − used − pending.`}
        actions={isSelf && <LinkButton href="/leave/new">File leave</LinkButton>}
      />
      <div className="space-y-6">
        <BalanceCards balances={balances.data ?? []} />
        <Card>
          <CardHeader title="Applications" />
          {(apps.data ?? []).length === 0 ? <EmptyState title="No leave applications yet" /> : (
            <Table caption="Leave applications">
              <THead><Th>Application</Th><Th>Type</Th><Th>Dates</Th><Th>Days</Th><Th>Status</Th></THead>
              <TBody>
                {apps.data!.map((a) => (
                  <tr key={a.id}>
                    <Td><Link className="font-medium text-brand-700 underline" href={`/leave/${a.id}`}>{a.request_no}</Link></Td>
                    <Td>{typeName(a.leave_type_code)}</Td>
                    <Td>{fmtDate(a.date_from)}{a.date_to !== a.date_from && ` – ${fmtDate(a.date_to)}`}</Td>
                    <Td>{fmtNumber(a.days, 1)}</Td>
                    <Td><RequestStatusBadge status={a.status} kind="leave_application" /></Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        {ctx.can("leave.manage") && (
          <Card>
            <CardHeader title="Maintain balance (HR)" description="Enter credited and used leave from the leave card. The system does not compute legal entitlement." />
            <CardBody>
              <ActionForm action={saveBalance}>
                <input type="hidden" name="employee_id" value={employeeId} />
                <FormGrid cols={3}>
                  <SelectField label="Leave type" name="leave_type_code" required options={lookups.leaveTypes.map((t) => ({ value: t.code, label: t.name }))} />
                  <TextField label="Year" name="year" type="number" required defaultValue={year} />
                  <TextField label="Beginning balance" name="beginning" type="number" step="0.001" min={0} required defaultValue="0" />
                  <TextField label="Earned" name="earned" type="number" step="0.001" min={0} required defaultValue="0" />
                  <TextField label="Used" name="used" type="number" step="0.001" min={0} required defaultValue="0" />
                </FormGrid>
                <SubmitButton>Save balance</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
