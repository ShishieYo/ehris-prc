import type { ViewRow } from "@/lib/db/types";
import { Card, CardBody } from "@/components/ui/primitives";
import { fmtNumber } from "@/lib/format";

export function BalanceCards({ balances }: { balances: ViewRow<"leave_balance_summary">[] }) {
  if (balances.length === 0) {
    return <Card><CardBody><p className="text-sm text-slate-600">No leave balances have been recorded for this year yet. HR maintains balances.</p></CardBody></Card>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {balances.map((b) => (
        <Card key={`${b.leave_type_code}`}>
          <CardBody>
            <p className="text-sm font-semibold text-slate-900">{b.leave_type_name}</p>
            <p className="mt-1 text-3xl font-semibold text-brand-900">{fmtNumber(b.available, 3)} <span className="text-sm font-normal text-slate-500">available</span></p>
            <dl className="mt-3 grid grid-cols-4 gap-2 text-xs">
              {([["Beginning", b.beginning], ["Earned", b.earned], ["Used", b.used], ["Pending", b.pending]] as const).map(([k, v]) => (
                <div key={k}><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-900">{fmtNumber(v, 3)}</dd></div>
              ))}
            </dl>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
