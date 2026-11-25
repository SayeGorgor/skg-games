import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RoleEditor } from "./role-editor";
import { allowedDestinationRoles } from "@/lib/admin/users/role-policy";
import { RoleAvailability } from "./role-availability";
import type { AppRole } from "@/lib/auth/permissions";
const entry = {
  userId: "target",
  displayName: null,
  email: null,
  role: "player" as AppRole,
  createdAt: null,
};
it("shows only disabled eligible controls, protects self/Owner/Admin, and exposes no editor", () => {
  for (const actorRole of ["owner", "admin"] as const) {
    for (const targetRole of ["owner", "admin", "analyst", "player"] as const) {
      const html = renderToStaticMarkup(
        <RoleAvailability
          actor={{ userId: "actor", role: actorRole }}
          target={{ ...entry, role: targetRole }}
        />,
      );
      const eligible =
        targetRole !== "owner" &&
        (actorRole === "owner" || targetRole !== "admin");
      expect(html.includes("Manage role")).toBe(eligible);
      if (eligible) expect(html).toContain('disabled=""');
      expect(html).not.toMatch(/<select|<dialog|<form|name="actor/);
    }
  }
  expect(
    renderToStaticMarkup(
      <RoleAvailability
        actor={{ userId: "target", role: "owner" }}
        target={entry}
      />,
    ),
  ).toContain("Your account");
});

const target = {
  ...entry,
  userId: "00000000-0000-4000-8000-000000000002",
  displayName: "Synthetic Player",
  roleSnapshot: {
    effectiveRole: "player",
    storedRole: null,
    roleRevision: null,
  } as const,
};
const actor = "00000000-0000-4000-8000-000000000001";

it.each([
  ["owner", ["analyst", "admin"]],
  ["admin", ["analyst"]],
  ["analyst", []],
  ["player", []],
] as const)(
  "renders only allowed controls and options for %s",
  (role, expected) => {
    const control = renderToStaticMarkup(
      <RoleAvailability
        actor={{ userId: actor, role }}
        target={target}
        enabled
        onManage={() => {}}
      />,
    );
    expect(control.includes('aria-haspopup="dialog"')).toBe(
      expected.length > 0,
    );
    const destinations = allowedDestinationRoles({
      actorId: actor,
      actorRole: role,
      targetRole: target.role,
      targetId: target.userId,
    });
    const dialog = renderToStaticMarkup(
      <RoleEditor
        target={target}
        destinations={destinations}
        pending={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(dialog).toContain("Synthetic Player");
    expect(dialog).toContain("Change application role?");
    expect(
      [...dialog.matchAll(/<option value="([a-z]+)"/g)].map(
        (match) => match[1],
      ),
    ).toEqual(expected);
    expect(dialog).toContain('disabled="">Confirm role change');
  },
);

it("offers an Owner an Admin target and withholds controls for self, protected roles and absent snapshots", () => {
  const adminTarget = {
    ...target,
    role: "admin" as const,
    roleSnapshot: {
      effectiveRole: "admin",
      storedRole: "admin",
      roleRevision: "10",
    } as const,
  };
  const actorRole = (role: AppRole, userId = actor) => ({ role, userId });
  const control = (
    current: ReturnType<typeof actorRole>,
    account: typeof adminTarget | typeof target,
  ) =>
    renderToStaticMarkup(
      <RoleAvailability
        actor={current}
        target={account}
        enabled
        onManage={() => {}}
      />,
    );
  expect(control(actorRole("owner"), adminTarget)).toContain(
    'aria-haspopup="dialog"',
  );
  expect(control(actorRole("admin"), adminTarget)).not.toContain("<button");
  expect(control(actorRole("owner", target.userId), target)).not.toContain(
    "<button",
  );
  expect(
    renderToStaticMarkup(
      <RoleAvailability
        actor={actorRole("owner")}
        target={{ ...target, roleSnapshot: undefined }}
        enabled
        onManage={() => {}}
      />,
    ),
  ).not.toContain("<button");
});

it("keeps an announced focus target when the pending dialog controls are disabled", () => {
  const html = renderToStaticMarkup(
    <RoleEditor
      target={target}
      destinations={["analyst", "admin"]}
      pending
      onCancel={() => {}}
      onConfirm={() => {}}
    />,
  );
  expect(html).toMatch(
    /role="status" tabindex="0">Submitting the change and checking the directory[.]{3}/,
  );
  expect(html).toMatch(/<select[^>]*disabled=""/);
  expect(html).toContain('disabled="">Cancel');
  expect(html).toContain('disabled="">Confirm role change');
});
