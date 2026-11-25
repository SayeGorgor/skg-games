import type { RoleManagementActor } from "./role-management";
import type { AppRole } from "@/lib/auth/permissions";
export type DirectoryInput = {
  search?: unknown;
  role?: unknown;
  pageSize?: unknown;
  cursor?: unknown;
  direction?: unknown;
};
export type DirectoryFilters = {
  search: string;
  role: AppRole | "all";
  pageSize: 25 | 50;
};
export type RoleSnapshot =
  | { effectiveRole: "player"; storedRole: null; roleRevision: null }
  | { effectiveRole: AppRole; storedRole: AppRole; roleRevision: string };
export type DirectoryEntry = {
  userId: string;
  displayName: string | null;
  email: string | null;
  role: AppRole;
  createdAt: string | null;
  roleSnapshot?: RoleSnapshot;
};
export type DirectorySource = {
  kind: "auth" | "profiles";
  dateLabel: string;
  coverage: string;
  emailNote: string;
};
export type DirectoryResult = {
  entries: DirectoryEntry[];
  total: number;
  filters: DirectoryFilters;
  source: DirectorySource;
  nextCursor: string | null;
  previousCursor: string | null;
};
export type DirectoryState = {
  status: "ready" | "invalid" | "error";
  result: DirectoryResult | null;
  message?: string;
  roleManagementEnabled?: boolean;
  page?: string;
  roleManagementActor?: RoleManagementActor | null;
};
