export type AppRole = "owner" | "admin" | "analyst" | "player";
export const appPermissions = [
  "analytics:read",
  "users:read",
  "users:manage",
  "roles:assign_lower",
  "roles:assign_admin",
  "system:manage",
] as const;
export type AppPermission = (typeof appPermissions)[number];
const rolePermissions: Readonly<Record<AppRole, readonly AppPermission[]>> = {
  player: [],
  analyst: ["analytics:read"],
  admin: ["analytics:read", "users:read", "users:manage", "roles:assign_lower"],
  owner: appPermissions,
};
export function isAppRole(value: unknown): value is AppRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "analyst" ||
    value === "player"
  );
}
/** Runtime validation also rejects unexpected database/browser values. */
export function hasPermission(
  role: AppRole,
  permission: AppPermission,
): boolean {
  return isAppRole(role) && rolePermissions[role].includes(permission);
}
