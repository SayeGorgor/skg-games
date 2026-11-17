import { allowedDestinationRoles } from "@/lib/admin/users/role-policy";
import type { RoleManagementActor } from "@/lib/admin/users/role-management";
import type { DirectoryEntry } from "@/lib/admin/users/types";

export function RoleAvailability({
  actor,
  target,
}: {
  actor: RoleManagementActor;
  target: DirectoryEntry;
}) {
  if (actor.userId === target.userId)
    return <small>Your account: role changes unavailable</small>;
  if (target.role === "owner") return <small>Owner role protected</small>;
  const destinations = allowedDestinationRoles({
    actorId: actor.userId,
    actorRole: actor.role,
    targetId: target.userId,
    targetRole: target.role,
  });
  if (!destinations.length) return <small>Role protected</small>;
  return (
    <span>
      <button
        type="button"
        disabled
        aria-describedby="role-management-unavailable"
      >
        Manage role
      </button>
      <small> Unavailable</small>
    </span>
  );
}
