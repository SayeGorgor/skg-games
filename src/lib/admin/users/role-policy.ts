import { hasPermission, isAppRole, type AppRole } from "@/lib/auth/permissions";

export type RoleTransition = {
  actorId: string;
  actorRole: unknown;
  targetId: string;
  targetRole: unknown;
  requestedRole: unknown;
};
export type RoleDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "invalid" | "forbidden" | "self" | "owner" | "no_op";
    };

/** Shared presentation and server preflight policy. PostgreSQL rechecks
 * authoritative roles within the atomic database operation. */
export function evaluateRoleTransition(input: RoleTransition): RoleDecision {
  const { actorId, actorRole, targetId, requestedRole } = input;
  const targetRole = input.targetRole === null ? "player" : input.targetRole;
  if (
    !actorId ||
    !targetId ||
    !isAppRole(actorRole) ||
    !isAppRole(targetRole) ||
    !isAppRole(requestedRole)
  )
    return { allowed: false, reason: "invalid" };
  if (
    !hasPermission(actorRole, "users:manage") ||
    !hasPermission(actorRole, "roles:assign_lower")
  )
    return { allowed: false, reason: "forbidden" };
  if (actorId === targetId) return { allowed: false, reason: "self" };
  if (targetRole === "owner" || requestedRole === "owner")
    return { allowed: false, reason: "owner" };
  if (
    (targetRole === "admin" || requestedRole === "admin") &&
    !hasPermission(actorRole, "roles:assign_admin")
  )
    return { allowed: false, reason: "forbidden" };
  if (targetRole === requestedRole) return { allowed: false, reason: "no_op" };
  return { allowed: true };
}

export function allowedDestinationRoles(
  input: Omit<RoleTransition, "requestedRole">,
): AppRole[] {
  return (["player", "analyst", "admin"] as const).filter(
    (requestedRole) =>
      evaluateRoleTransition({ ...input, requestedRole }).allowed,
  );
}
