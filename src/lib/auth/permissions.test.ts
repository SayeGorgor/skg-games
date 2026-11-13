import { expect, it } from "vitest";
import {
  appPermissions,
  hasPermission,
  isAppRole,
  type AppRole,
  type AppPermission,
} from "./permissions";
const expected: Record<AppRole, readonly AppPermission[]> = {
  player: [],
  analyst: ["analytics:read"],
  admin: ["analytics:read", "users:read", "users:manage", "roles:assign_lower"],
  owner: appPermissions,
};
it.each(["player", "analyst", "admin", "owner"] as const)(
  "enforces the complete %s permission matrix",
  (role) => {
    for (const permission of appPermissions)
      expect(hasPermission(role, permission)).toBe(
        expected[role].includes(permission),
      );
  },
);
it("rejects invalid and inherited-object role names and permissions", () => {
  for (const role of [
    null,
    undefined,
    "Owner",
    "superadmin",
    "__proto__",
    "constructor",
    {},
    ["owner"],
  ]) {
    expect(isAppRole(role)).toBe(false);
    expect(hasPermission(role as AppRole, "analytics:read")).toBe(false);
  }
  expect(hasPermission("owner", "roles:assign_owner" as AppPermission)).toBe(
    false,
  );
});
