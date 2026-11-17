"use server";
import { requirePermission } from "@/lib/auth/authorization";
import {
  changeUserRole,
  type RoleChangeResult,
} from "@/lib/admin/users/role-management";

/** Next.js POST action: built-in Origin/Host checks remain enabled. */
export async function requestRoleChange(
  input: unknown,
): Promise<RoleChangeResult> {
  await requirePermission("users:manage");
  return changeUserRole(input);
}
