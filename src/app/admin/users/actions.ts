"use server";
import { unstable_rethrow } from "next/navigation";
import { requirePermission } from "@/lib/auth/authorization";
import { readUserDirectory } from "@/lib/admin/users/queries";
import { DirectoryInputError } from "@/lib/admin/users/filters";
import { isRoleManagementEnabled } from "@/lib/admin/users/role-management-feature";
import { getRoleManagementActor } from "@/lib/admin/users/role-management";
import type { DirectoryState } from "@/lib/admin/users/types";

export async function searchUsers(form: FormData): Promise<DirectoryState> {
  await requirePermission("users:read");
  try {
    const allowed = new Set(["search", "role", "pageSize", "page"]);
    for (const key of form.keys()) {
      if (
        !key.startsWith("$ACTION_") &&
        (!allowed.has(key) || form.getAll(key).length !== 1)
      )
        throw new DirectoryInputError();
    }
    const field = (key: string) => {
      const value = form.get(key);
      if (value !== null && typeof value !== "string")
        throw new DirectoryInputError();
      return value ?? undefined;
    };
    const page = field("page") ?? "first";
    if (
      page !== "first" &&
      !page.startsWith("next:") &&
      !page.startsWith("previous:")
    )
      throw new DirectoryInputError();
    const actor = await getRoleManagementActor();
    const enabled = !!actor && isRoleManagementEnabled();
    const filters = {
      search: field("search"),
      role: field("role"),
      pageSize: field("pageSize"),
    };
    const cursor = page?.slice(page.indexOf(":") + 1) || undefined;
    const read = (input: Parameters<typeof readUserDirectory>[0]) =>
      enabled ? readUserDirectory(input, true) : readUserDirectory(input);
    let result = await read({
      ...filters,
      cursor: page === "first" ? undefined : cursor,
      direction: page?.startsWith("next:")
        ? "next"
        : page?.startsWith("previous:")
          ? "previous"
          : undefined,
    });
    let resolvedPage = page ?? "first";
    if (cursor && page !== "first" && result.entries.length === 0) {
      if (result.total > 0) result = await read(filters);
      resolvedPage = "first";
    }
    return {
      status: "ready",
      result,
      page: resolvedPage,
      roleManagementEnabled: enabled,
      roleManagementActor: actor,
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      status: error instanceof DirectoryInputError ? "invalid" : "error",
      result: null,
      message:
        error instanceof DirectoryInputError
          ? error.message
          : "The user directory is temporarily unavailable. Please try again.",
    };
  }
}
