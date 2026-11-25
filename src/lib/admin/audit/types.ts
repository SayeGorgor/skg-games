import type { AppRole } from "@/lib/auth/permissions";

export type AuditAction = "owner_bootstrap" | "role_assignment";
export type AuditEvent = {
  id: string;
  action: AuditAction;
  actorType: "system_bootstrap" | "authenticated_admin";
  actorId: string | null;
  targetId: string | null;
  previousRole: AppRole | null;
  newRole: AppRole;
  createdAt: string;
};
export type AuditPage = { events: AuditEvent[]; nextCursor: string | null };
export type AuditState =
  | { status: "ready"; page: AuditPage }
  | {
      status:
        | "disabled"
        | "unconfigured"
        | "unavailable"
        | "invalid_filters"
        | "invalid_cursor";
    };
