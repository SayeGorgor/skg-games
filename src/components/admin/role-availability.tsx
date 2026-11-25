import { allowedDestinationRoles } from "@/lib/admin/users/role-policy";
import type { RoleManagementActor } from "@/lib/admin/users/role-management";
import type { DirectoryEntry } from "@/lib/admin/users/types";
import type { AppRole } from "@/lib/auth/permissions";
import type { RoleEditorTarget } from "./role-editor";

export function RoleAvailability({
  actor,
  target,
  enabled = false,
  pending = false,
  onManage,
}: {
  actor: RoleManagementActor;
  target: DirectoryEntry;
  enabled?: boolean;
  pending?: boolean;
  onManage?: (
    target: RoleEditorTarget,
    destinations: AppRole[],
    opener: HTMLButtonElement,
  ) => void;
}) {
  if (actor.userId === target.userId)
    return <small>Your account: role changes unavailable</small>;
  const role = target.roleSnapshot?.effectiveRole ?? target.role;
  if (role === "owner") return <small>Owner role protected</small>;
  const destinations = allowedDestinationRoles({
    actorId: actor.userId,
    actorRole: actor.role,
    targetId: target.userId,
    targetRole: role,
  });
  if (!destinations.length) return <small>Role protected</small>;

  const { roleSnapshot } = target;
  if (!enabled) {
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
  if (
    !roleSnapshot ||
    !onManage ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      target.userId,
    )
  )
    return <small>Role change unavailable</small>;
  return (
    <button
      type="button"
      disabled={pending}
      aria-haspopup="dialog"
      onClick={(event) =>
        onManage({ ...target, roleSnapshot }, destinations, event.currentTarget)
      }
    >
      Manage Role
    </button>
  );
}
