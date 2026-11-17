import { expect, it } from "vitest";
import { evaluateRoleTransition, allowedDestinationRoles } from "./role-policy";
const roles = ["owner", "admin", "analyst", "player"] as const;
for (const actorRole of roles)
  for (const targetRole of roles)
    for (const requestedRole of roles) {
      it(`${actorRole}: ${targetRole} -> ${requestedRole}`, () => {
        const expected =
          targetRole !== requestedRole &&
          targetRole !== "owner" &&
          requestedRole !== "owner" &&
          (actorRole === "owner" ||
            (actorRole === "admin" &&
              targetRole !== "admin" &&
              requestedRole !== "admin"));
        expect(
          evaluateRoleTransition({
            actorId: "actor",
            targetId: "target",
            actorRole,
            targetRole,
            requestedRole,
          }).allowed,
        ).toBe(expected);
      });
    }
it("denies self changes, invalid roles and absent identities", () => {
  for (const actorRole of roles)
    for (const requestedRole of roles)
      expect(
        evaluateRoleTransition({
          actorId: "same",
          targetId: "same",
          actorRole,
          targetRole: "player",
          requestedRole,
        }).allowed,
      ).toBe(false);
  for (const invalid of ["root", "OWNER", "", undefined, {}, 1]) {
    for (const field of ["actorRole", "targetRole", "requestedRole"])
      expect(
        evaluateRoleTransition({
          actorId: "a",
          targetId: "b",
          actorRole: "owner",
          targetRole: "player",
          requestedRole: "analyst",
          [field]: invalid,
        }).allowed,
      ).toBe(false);
  }
  expect(
    evaluateRoleTransition({
      actorId: "",
      targetId: "b",
      actorRole: "owner",
      targetRole: "player",
      requestedRole: "admin",
    }).allowed,
  ).toBe(false);
});
it("treats a missing role as Player and rejects no-op assignments", () => {
  for (const targetRole of [null, "player"])
    expect(
      allowedDestinationRoles({
        actorId: "a",
        actorRole: "owner",
        targetId: "b",
        targetRole,
      }),
    ).toEqual(["analyst", "admin"]);
  expect(
    evaluateRoleTransition({
      actorId: "a",
      actorRole: "owner",
      targetId: "b",
      targetRole: null,
      requestedRole: "player",
    }),
  ).toEqual({ allowed: false, reason: "no_op" });
  expect(
    allowedDestinationRoles({
      actorId: "a",
      actorRole: "admin",
      targetId: "b",
      targetRole: "analyst",
    }),
  ).toEqual(["player"]);
});
