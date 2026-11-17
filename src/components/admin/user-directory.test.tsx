import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
vi.mock("@/app/admin/users/actions", () => ({ searchUsers: vi.fn() }));
vi.mock("./users.module.css", () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}));
import { UserDirectory } from "./user-directory";
import type { DirectoryResult, DirectoryState } from "@/lib/admin/users/types";
const fixture: DirectoryResult = {
  source: {
    kind: "auth",
    dateLabel: "Joined",
    coverage:
      "Registered Neon Auth accounts, including accounts without an application profile.",
    emailNote: "Email comes from Neon Auth.",
  },
  filters: { search: "", role: "all", pageSize: 25 },
  total: 4,
  nextCursor: "synthetic-next",
  previousCursor: null,
  entries: ["owner", "admin", "analyst", "player"].map((role, i) => ({
    userId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    displayName:
      i === 3
        ? null
        : [
            "Morgan Example",
            "Alex Example",
            "A very long display name that must never break a small screen",
          ][i],
    email:
      i === 3
        ? null
        : `${i === 2 ? "extremely-long-address-with-many-characters-for-layout-testing" : "person"}${i}@example.test`,
    role: role as DirectoryResult["entries"][number]["role"],
    createdAt: i === 3 ? null : "2026-11-17T04:30:00.000001Z",
  })),
};
it("renders semantic read-only rows, dates, neutral fallbacks and safe copy controls", () => {
  const html = renderToStaticMarkup(
    <UserDirectory initial={{ status: "ready", result: fixture }} />,
  );
  expect(html).toContain("Nov 16, 2026");
  expect(html).toContain("Not available");
  expect(html).toContain("Name not available");
  expect(html).toContain('scope="row"');
  expect(html).toContain('tabindex="0"');
  expect(html).toContain("Copy full immutable user ID");
  expect(html).not.toMatch(/Edit Role|Delete User|Suspend/);
  if (process.env.SKG_LOCAL_USERS_PREVIEW === "1") {
    mkdirSync("developer-docs", { recursive: true });
    writeFileSync(
      "developer-docs/admin-users-fixture.json",
      JSON.stringify(fixture),
    );
    const css = readFileSync("src/components/admin/users.module.css", "utf8");
    const global = readFileSync("src/app/globals.css", "utf8")
      .split(String.fromCharCode(10))
      .filter((line) => !line.startsWith("@import"))
      .join(String.fromCharCode(10));
    writeFileSync(
      "developer-docs/admin-users-preview.html",
      `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${global}${css}</style><body><nav class="container navigation"><a href="#">SKG Games</a><a href="#">Analytics</a><a href="#">User Management</a></nav><main class="container page"><header class="header"><span class="eyebrow blue">READ ONLY / SYNTHETIC PREVIEW</span><h1>User Management</h1><p>Find accounts and view their application roles.</p></header>${html}</main></body></html>`,
    );
  }
});
it("distinguishes profile-only scope and honest empty/error states", () => {
  const profile = {
    ...fixture,
    entries: [],
    total: 0,
    source: {
      ...fixture.source,
      kind: "profiles" as const,
      dateLabel: "Profile created",
      coverage: "Profile directory only; not all signups.",
    },
  };
  const html = renderToStaticMarkup(
    <UserDirectory initial={{ status: "ready", result: profile }} />,
  );
  expect(html).toContain("Application profiles");
  expect(html).toContain("not all signups");
  expect(html).toContain("No application profiles found");
  const error: DirectoryState = {
    status: "error",
    result: null,
    message: "The user directory is temporarily unavailable.",
  };
  expect(renderToStaticMarkup(<UserDirectory initial={error} />)).toContain(
    'role="alert"',
  );
});
it("keeps personal data out of URLs and shows no writable role controls", () => {
  const html = renderToStaticMarkup(
    <UserDirectory initial={{ status: "ready", result: fixture }} />,
  );
  expect(html).not.toContain("?search=");
  expect(html).not.toContain("mailto:");
  expect(html).not.toContain('name="userId"');
  expect(html).toContain("Read only");
  expect(html).toContain("First page");
});
