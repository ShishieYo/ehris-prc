import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createDb, type Db } from "@/lib/supabase/server";
import type { Permission } from "./permissions";

type MyAccess = {
  user_id: string;
  display_name: string;
  employee_id: string | null;
  privacy_acknowledged_at: string | null;
  privacy_notice_version: string | null;
  current_privacy_version: string;
  roles: string[];
  permissions: string[];
};

/** Everything a page or action needs to know about the signed-in user. */
export type Ctx = {
  db: Db;
  userId: string;
  email: string;
  displayName: string;
  employeeId: string | null;
  roles: string[];
  privacyOk: boolean;
  currentPrivacyVersion: string;
  can: (p: Permission) => boolean;
  canAny: (...p: Permission[]) => boolean;
};

/**
 * Resolves the session once per request. The user is verified with the Auth
 * server (not just decoded from the cookie) and permissions come from the
 * database — the UI uses them only to decide what to show; the database
 * enforces them regardless.
 */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const db = await createDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;

  const { data, error } = await db.rpc("my_access");
  if (error) throw error;
  const access = data as MyAccess | null;
  if (!access) return null;

  const permissions = new Set(access.permissions);
  return {
    db,
    userId: access.user_id,
    email: user.email ?? "",
    displayName: access.display_name,
    employeeId: access.employee_id,
    roles: access.roles,
    privacyOk: access.privacy_notice_version === access.current_privacy_version,
    currentPrivacyVersion: access.current_privacy_version,
    can: (p) => permissions.has(p),
    canAny: (...ps) => ps.some((p) => permissions.has(p)),
  };
});

/** For pages inside the signed-in area. Redirects when there is no usable session. */
export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  return ctx;
}

/** For server actions: same as requireCtx, but also demands the privacy acknowledgement. */
export async function requireActionCtx(): Promise<Ctx> {
  const ctx = await requireCtx();
  if (!ctx.privacyOk) redirect("/privacy/accept");
  return ctx;
}
