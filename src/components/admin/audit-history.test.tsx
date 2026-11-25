import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AuditHistory } from "./audit-history";
import { AdminNavigation } from "./navigation";
import type { AuditEvent } from "@/lib/admin/audit/types";
vi.mock("@/app/admin/audit/actions", () => ({ searchAuditHistory: vi.fn() }));
vi.mock("./users.module.css", () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}));
vi.mock("./audit-history.module.css", () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}));

const bootstrap: AuditEvent = {
  id: "00000000-0000-4000-8000-000000000001",
  action: "owner_bootstrap",
  actorType: "system_bootstrap",
  actorId: null,
  targetId: "00000000-0000-4000-8000-000000000002",
  previousRole: null,
  newRole: "owner",
  createdAt: "2026-11-18T12:00:00.123456Z",
};
const assignment: AuditEvent = {
  ...bootstrap,
  id: "00000000-0000-4000-8000-000000000003",
  action: "role_assignment",
  actorType: "authenticated_admin",
  actorId: bootstrap.targetId,
  targetId: null,
  previousRole: "player",
  newRole: "analyst",
};
const populated = (
  <AuditHistory
    initial={{
      status: "ready",
      page: { events: [assignment, bootstrap], nextCursor: "synthetic" },
    }}
  />
);

it("distinguishes role changes, bootstrap, missing identities and explicit Player", () => {
  const html = renderToStaticMarkup(populated);
  for (const label of [
    "Initial Owner bootstrap",
    "Operator workflow",
    "No stored role",
    "Player",
    "Account reference unavailable",
    "Affected account",
    "Event details",
    "Nov 18, 2026",
    "UTC",
    "Newest events",
    "Older events",
  ])
    expect(html).toContain(label);
  expect(html).not.toContain("operator_reference");
  expect(html).not.toContain("mailto:");
});

it("uses distinct disabled, empty and unavailable states and only advertises audit to Owners", () => {
  expect(
    renderToStaticMarkup(<AuditHistory initial={{ status: "disabled" }} />),
  ).toContain("disabled for this deployment");
  expect(
    renderToStaticMarkup(<AuditHistory initial={{ status: "unconfigured" }} />),
  ).toContain("not configured");
  expect(
    renderToStaticMarkup(<AuditHistory initial={{ status: "unavailable" }} />),
  ).toContain('role="alert"');
  expect(
    renderToStaticMarkup(
      <AuditHistory
        initial={{ status: "ready", page: { events: [], nextCursor: null } }}
      />,
    ),
  ).toContain("No events match");
  for (const role of ["owner", "admin", "analyst", "player"] as const) {
    expect(
      renderToStaticMarkup(
        <AdminNavigation role={role} auditEnabled />,
      ).includes("/admin/audit"),
    ).toBe(role === "owner");
  }
  expect(renderToStaticMarkup(<AdminNavigation role="owner" />)).not.toContain(
    "/admin/audit",
  );
});

it.skipIf(!process.env.SKG_AUDIT_BROWSER_QA)(
  "checks layout, keyboard details and filter labels in Chromium",
  async () => {
    const { chromium, expect: browserExpect } =
      await import("@playwright/test");
    const css = [
      "node_modules/tailwindcss/preflight.css",
      "src/app/globals.css",
      "src/components/admin/users.module.css",
      "src/components/admin/audit-history.module.css",
    ]
      .map((file) => readFileSync(file, "utf8").replace(/^@import.*$/gm, ""))
      .join("\n");
    const browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || undefined,
    });
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      for (const width of [360, 768, 1024, 1440])
        for (const theme of ["light", "dark"]) {
          await page.setViewportSize({ width, height: 850 });
          await page.setContent(
            `<!doctype html><html lang="en" data-theme="${theme}"><style>${css}</style><main class="container page">${renderToStaticMarkup(populated)}</main></html>`,
          );
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width);
          if (width >= 768)
            expect(
              await page
                .getByRole("region", { name: "Role audit events" })
                .evaluate((node) => node.scrollWidth - node.clientWidth),
            ).toBeLessThanOrEqual(1);
          await browserExpect(
            page.getByLabel("Initiator account ID"),
          ).toBeVisible();
          const details = page
            .getByText("Event details", { exact: true })
            .first();
          await details.focus();
          await page.keyboard.press("Enter");
          await browserExpect(
            page.getByText("Initiator ID", { exact: true }),
          ).toBeVisible();
          await page.keyboard.press("Enter");
          await browserExpect(
            page.getByText("Initiator ID", { exact: true }),
          ).not.toBeVisible();
        }
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  },
  20000,
);
