import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/auth/viewer", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { getViewer, type Viewer } from "./viewer";
import { getDb } from "@/lib/db";
import {
  getRoleForUser,
  getCurrentUserRole,
  requirePermission,
} from "./authorization";
import { requireAnalyticsAdmin } from "@/lib/analytics/access";
import { readAnalytics } from "@/lib/analytics/queries";
const pg = new PGlite();
const db = drizzle(pg);
const authenticated = {
  userId: "trusted-session-user",
  authenticated: true,
  premium: false,
  email: "private@example.test",
  name: "Owner",
} satisfies Viewer;
let existingProfile: unknown;
beforeAll(async () => {
  for (const file of readdirSync("drizzle")
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort()) {
    if (file === "0006_application_roles.sql") {
      await pg.exec(
        "INSERT INTO user_profiles(user_id,email,display_name,preferred_theme) VALUES ('existing-user','existing@example.test','Existing','dark')",
      );
    }
    await pg.exec(
      readFileSync(path.join("drizzle", file), "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
  }
  existingProfile = (
    await pg.query(
      "SELECT user_id,email,display_name,preferred_theme FROM user_profiles WHERE user_id='existing-user'",
    )
  ).rows[0];
}, 30000);
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv("SKG_ANALYTICS_ADMIN_USER_IDS", undefined);
  vi.mocked(getDb).mockReturnValue(
    db as unknown as NonNullable<ReturnType<typeof getDb>>,
  );
  vi.mocked(getViewer).mockResolvedValue(authenticated);
  await pg.exec("DELETE FROM user_roles");
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await pg.close();
});
async function assign(role: string, userId = authenticated.userId) {
  await pg.query("INSERT INTO user_roles(user_id,role) VALUES ($1,$2)", [
    userId,
    role,
  ]);
}
it("preserves the profile-email migration and existing profiles without granting any role", async () => {
  expect(existingProfile).toEqual({
    user_id: "existing-user",
    email: "existing@example.test",
    display_name: "Existing",
    preferred_theme: "dark",
  });
  expect((await pg.query("SELECT * FROM user_roles")).rows).toEqual([]);
  expect(await getRoleForUser("existing-user")).toBe("player");
});
it("defaults to player without a role row, without creating a row", async () => {
  expect(await getRoleForUser(authenticated.userId)).toBe("player");
  expect(await getCurrentUserRole()).toBe("player");
  expect((await pg.query("SELECT * FROM user_roles")).rows).toEqual([]);
});
it.each(["player", "analyst", "admin", "owner"] as const)(
  "resolves a stored %s role",
  async (role) => {
    await assign(role);
    expect(await getRoleForUser(authenticated.userId)).toBe(role);
    expect(await getCurrentUserRole()).toBe(role);
  },
);
it("queries only the current trusted identity; ignores browser-like fields, email, name and premium", async () => {
  await assign("owner", "client-submitted-user");
  vi.mocked(getViewer).mockResolvedValue({
    ...authenticated,
    premium: true,
    role: "owner",
    requestedUserId: "client-submitted-user",
  } as Viewer);
  expect(await getCurrentUserRole()).toBe("player");
  await expect(requireAnalyticsAdmin()).rejects.toThrow("NOT_FOUND");
  await expect(requirePermission("analytics:read")).rejects.toThrow(
    "NOT_FOUND",
  );
});
it("denies signed-out sessions even if an identity string matches a role row", async () => {
  await assign("owner");
  vi.mocked(getViewer).mockResolvedValue({
    ...authenticated,
    authenticated: false,
  });
  expect(await getCurrentUserRole()).toBe("player");
  await expect(requirePermission("users:manage")).rejects.toThrow("NOT_FOUND");
  await expect(requireAnalyticsAdmin()).rejects.toThrow("NOT_FOUND");
  expect(getDb).not.toHaveBeenCalled();
});
it("rejects invalid data and role query failures without exposing errors", async () => {
  const invalidDb = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ role: "superadmin" }] }),
      }),
    }),
  };
  vi.mocked(getDb).mockReturnValue(
    invalidDb as unknown as NonNullable<ReturnType<typeof getDb>>,
  );
  expect(await getCurrentUserRole()).toBe("player");
  await expect(requirePermission("analytics:read")).rejects.toThrow(
    "NOT_FOUND",
  );
  vi.mocked(getDb).mockImplementation(() => {
    throw new Error("sensitive database error");
  });
  expect(await getRoleForUser(authenticated.userId)).toBe("player");
  await expect(requireAnalyticsAdmin()).rejects.toThrow("NOT_FOUND");
});
it("fails closed for unavailable DB and session errors", async () => {
  vi.mocked(getDb).mockReturnValue(null);
  expect(await getCurrentUserRole()).toBe("player");
  await expect(requirePermission("system:manage")).rejects.toThrow("NOT_FOUND");
  await expect(requireAnalyticsAdmin()).rejects.toThrow("NOT_FOUND");
  vi.mocked(getViewer).mockRejectedValue(new Error("sensitive session error"));
  await expect(requirePermission("analytics:read")).rejects.toThrow(
    "NOT_FOUND",
  );
});
it("reflects promotions, downgrades and deletion without a new session or persistent cache", async () => {
  await assign("analyst");
  expect(await requirePermission("analytics:read")).toBeUndefined();
  await pg.query("UPDATE user_roles SET role='owner' WHERE user_id=$1", [
    authenticated.userId,
  ]);
  expect(await requirePermission("system:manage")).toBeUndefined();
  await pg.query("UPDATE user_roles SET role='player' WHERE user_id=$1", [
    authenticated.userId,
  ]);
  await expect(requirePermission("analytics:read")).rejects.toThrow(
    "NOT_FOUND",
  );
  await expect(requireAnalyticsAdmin()).rejects.toThrow("NOT_FOUND");
  await pg.exec("DELETE FROM user_roles");
  expect(await getCurrentUserRole()).toBe("player");
});
it("a stale allowlist cannot authorize a missing or explicit Player assignment", async () => {
  vi.stubEnv("SKG_ANALYTICS_ADMIN_USER_IDS", authenticated.userId);
  await expect(requireAnalyticsAdmin()).rejects.toThrow("NOT_FOUND");
  expect(await getCurrentUserRole()).toBe("player");
  await assign("player");
  await expect(requireAnalyticsAdmin()).rejects.toThrow("NOT_FOUND");
  await expect(requirePermission("users:manage")).rejects.toThrow("NOT_FOUND");
});
it("a stale allowlist never bypasses role database failures or an absent connection", async () => {
  vi.stubEnv("SKG_ANALYTICS_ADMIN_USER_IDS", authenticated.userId);
  vi.mocked(getDb).mockImplementation(() => {
    throw new Error("private database error");
  });
  await expect(requireAnalyticsAdmin()).rejects.toThrow("NOT_FOUND");
  vi.mocked(getDb).mockReturnValue(null);
  await expect(requireAnalyticsAdmin()).rejects.toThrow("NOT_FOUND");
  expect(await getCurrentUserRole()).toBe("player");
});
it.each(["analyst", "admin", "owner"] as const)(
  "allows %s analytics without legacy configuration",
  async (role) => {
    await assign(role);
    expect(await requireAnalyticsAdmin()).toBeUndefined();
  },
);
it("enforces enum validity and single assignment per user, with default timestamps and no managed FK", async () => {
  await expect(assign("superadmin")).rejects.toThrow();
  await assign("player");
  await expect(assign("admin")).rejects.toThrow();
  const row = (
    await pg.query<{ created_at: Date; updated_at: Date }>(
      "SELECT created_at,updated_at FROM user_roles",
    )
  ).rows[0];
  expect(row.created_at).toBeTruthy();
  expect(row.updated_at).toBeTruthy();
  expect(
    (
      await pg.query(
        "SELECT * FROM information_schema.table_constraints WHERE table_name='user_roles' AND constraint_type='FOREIGN KEY'",
      )
    ).rows,
  ).toEqual([]);
});

it("enforces real database roles at the aggregate data boundary without leaking identities", async () => {
  vi.stubEnv("SKG_ANALYTICS_ADMIN_USER_IDS", authenticated.userId);
  const execute = vi.spyOn(db, "execute");
  await expect(readAnalytics("7")).rejects.toThrow("NOT_FOUND");
  expect(execute).not.toHaveBeenCalled();
  await assign("analyst");
  const data = await readAnalytics("7");
  expect(data?.overview).toEqual({ results: 0, solves: 0, accounts: 0 });
  expect(execute).toHaveBeenCalledOnce();
  expect(JSON.stringify(data)).not.toMatch(
    /trusted-session-user|private@example.test|role|user_id/,
  );
  await pg.query("UPDATE user_roles SET role='player' WHERE user_id=$1", [
    authenticated.userId,
  ]);
  await expect(readAnalytics("7")).rejects.toThrow("NOT_FOUND");
  expect(execute).toHaveBeenCalledOnce();
  execute.mockRestore();
});
