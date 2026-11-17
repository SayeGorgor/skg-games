import "server-only";
import { getViewer } from "@/lib/auth/viewer";
import { getRoleForUser } from "@/lib/auth/authorization";
import { hasPermission, isAppRole, type AppRole } from "@/lib/auth/permissions";
import { evaluateRoleTransition } from "./role-policy";
import { writeApplicationRole, type WriterStatus } from "./role-writer";

export type RoleManagementActor = { userId: string; role: AppRole };
export type RoleChangeResult = {
  status: WriterStatus;
};

export async function getRoleManagementActor(): Promise<RoleManagementActor | null> {
  try {
    const viewer = await getViewer();
    if (!viewer.authenticated || !viewer.userId) return null;
    const role = await getRoleForUser(viewer.userId);
    if (
      !hasPermission(role, "users:manage") ||
      !hasPermission(role, "roles:assign_lower")
    )
      return null;
    return { userId: viewer.userId, role };
  } catch {
    return null;
  }
}

/** Independent authorization boundary. The database rechecks all authority. */
export async function changeUserRole(
  input: unknown,
): Promise<RoleChangeResult> {
  const actor = await getRoleManagementActor();
  if (!actor) return { status: "forbidden" };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { status: "forbidden" };
  const data = input as Record<string, unknown>;
  if (
    ![3, 4].includes(Object.keys(data).length) ||
    Object.keys(data).some(
      (key) =>
        ![
          "targetId",
          "requestedRole",
          "expectedRole",
          "expectedRevision",
        ].includes(key),
    ) ||
    typeof data.targetId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      data.targetId,
    ) ||
    !isAppRole(data.requestedRole) ||
    !(data.expectedRole === null || isAppRole(data.expectedRole))
  )
    return { status: "forbidden" };
  // Expected role is an untrusted hint, used only for early denial. Never use it
  // to authorize a write or disclose whether an Auth target actually exists.
  const decision = evaluateRoleTransition({
    actorId: actor.userId,
    actorRole: actor.role,
    targetId: data.targetId,
    targetRole: data.expectedRole,
    requestedRole: data.requestedRole,
  });
  if (!decision.allowed) return { status: "forbidden" };
  // Legacy requests cannot establish an ABA-safe expected state.
  if (!Object.hasOwn(data, "expectedRevision"))
    return { status: "temporarily_unavailable" };
  if (
    data.expectedRole === null
      ? data.expectedRevision !== null
      : typeof data.expectedRevision !== "string" ||
        !/^(0|[1-9][0-9]{0,18})$/.test(data.expectedRevision) ||
        BigInt(data.expectedRevision) > 9223372036854775807n
  )
    return { status: "forbidden" };
  return {
    status: await writeApplicationRole({
      actorId: actor.userId,
      targetId: data.targetId,
      requestedRole: data.requestedRole as AppRole,
      expectedRole: data.expectedRole as AppRole | null,
      expectedRevision: data.expectedRevision as string | null,
    }),
  };
}
