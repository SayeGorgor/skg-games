import { isAppRole } from "@/lib/auth/permissions";
import type { DirectoryInput, DirectoryFilters } from "./types";
export class DirectoryInputError extends Error {
  constructor() {
    super(
      "Choose a valid role and page size, and search using 2 to 120 characters or leave search empty.",
    );
  }
}
export function hasControlCharacters(value: string): boolean {
  return Array.from(value).some(
    (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
  );
}
export function parseDirectoryFilters(input: DirectoryInput): DirectoryFilters {
  const search = input.search === undefined ? "" : input.search;
  const role = input.role === undefined ? "all" : input.role;
  const pageSize = input.pageSize === undefined ? "25" : input.pageSize;
  if (
    typeof search !== "string" ||
    search.length > 512 ||
    hasControlCharacters(search)
  )
    throw new DirectoryInputError();
  const trimmed = search.trim();
  if (
    trimmed.length > 120 ||
    trimmed.length === 1 ||
    (role !== "all" && !isAppRole(role)) ||
    !["25", "50"].includes(String(pageSize)) ||
    (typeof pageSize !== "number" && typeof pageSize !== "string")
  )
    throw new DirectoryInputError();
  return { search: trimmed, role, pageSize: Number(pageSize) as 25 | 50 };
}
export function escapeDirectorySearch(value: string): string {
  const slash = String.fromCharCode(92);
  return value
    .replaceAll(slash, slash + slash)
    .replaceAll("%", slash + "%")
    .replaceAll("_", slash + "_");
}
