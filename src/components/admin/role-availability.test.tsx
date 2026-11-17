import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
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
