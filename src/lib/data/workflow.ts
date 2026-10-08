import "server-only";
import type { Ctx } from "@/lib/auth/session";
import type { EntityType, Row } from "@/lib/db/types";
import type { TimelineEntry } from "@/components/ui/timeline";

export async function getWorkflowSteps(ctx: Ctx, workflowCode: string | null) {
  if (!workflowCode) return [];
  const { data, error } = await ctx.db.from("workflow_steps").select("*").eq("workflow_code", workflowCode).order("step_order");
  if (error) throw error;
  return data ?? [];
}

const ACTION_LABEL: Record<string, string> = {
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  returned: "Returned for revision",
  cancelled: "Cancelled",
  completed: "Completed",
  comment: "Comment",
  assigned: "Assigned",
  document_attached: "Document attached",
};

export async function getTimeline(ctx: Ctx, type: EntityType, id: string): Promise<TimelineEntry[]> {
  const { data, error } = await ctx.db.from("workflow_actions").select("*").eq("entity_type", type).eq("entity_id", id).order("id");
  if (error) throw error;
  return (data ?? []).map((a: Row<"workflow_actions">) => ({
    key: a.id,
    title: `${ACTION_LABEL[a.action] ?? a.action}${a.step_name && a.action !== "comment" ? ` — ${a.step_name}` : ""}`,
    at: a.created_at,
    by: a.actor_name,
    remarks: a.action === "assigned" ? `Assigned to ${a.remarks}` : a.remarks,
    tone: a.action === "rejected" || a.action === "cancelled" ? "reject" : a.action === "comment" || a.action === "assigned" ? "info" : "done",
  }));
}

/** What the signed-in user may do with a request right now (UI hint; the database re-checks). */
export async function canActOn(ctx: Ctx, type: EntityType, id: string): Promise<boolean> {
  const { data, error } = await ctx.db.rpc("my_pending_actions");
  if (error) throw error;
  return (data ?? []).some((r) => r.entity_type === type && r.entity_id === id);
}
