"use server";
import { isRoleManagementEnabled } from "@/lib/admin/users/role-management-feature";
import {
  changeUserRole,
  type RoleChangeResult,
} from "@/lib/admin/users/role-management";

/** Next.js POST action: built-in Origin/Host checks remain enabled. */
export async function requestRoleChange(
  input: unknown,
): Promise<RoleChangeResult> {
  if (!isRoleManagementEnabled()) return { status: "temporarily_unavailable" };
  return changeUserRole(input);
}
