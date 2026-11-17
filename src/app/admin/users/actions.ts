"use server";
import { unstable_rethrow } from "next/navigation";
import { requirePermission } from "@/lib/auth/authorization";
import { readUserDirectory } from "@/lib/admin/users/queries";
import { DirectoryInputError } from "@/lib/admin/users/filters";
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
    return {
      status: "ready",
      result: await readUserDirectory({
        search: field("search"),
        role: field("role"),
        pageSize: field("pageSize"),
        cursor:
          page === "first" ? undefined : page.slice(page.indexOf(":") + 1),
        direction:
          page === "first"
            ? undefined
            : page.startsWith("next:")
              ? "next"
              : "previous",
      }),
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
