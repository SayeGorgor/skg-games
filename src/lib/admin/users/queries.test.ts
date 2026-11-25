import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth/viewer", () => ({ getViewer: vi.fn() }));
import { getDb } from "@/lib/db";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import { readUserDirectory } from "./queries";
const pg = new PGlite(),
  db = drizzle(pg);
const actor = {
  userId: "actor",
  authenticated: true,
  premium: false,
  email: "actor@example.test",
  name: "Actor",
} as Viewer;
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
beforeAll(async () => {
  for (const name of readdirSync("drizzle")
    .filter(
      (n) =>
        /^[0-9]+.*[.]sql$/.test(n) &&
        ![
          "0008_role_change_engine.sql",
          "0009_admin_audit_reader.sql",
        ].includes(n),
    )
    .sort())
    await pg.exec(
      readFileSync(path.join("drizzle", name), "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
  await pg.exec(
    "ALTER TABLE public.user_roles ADD COLUMN role_revision bigint NOT NULL DEFAULT 0",
  );
}, 30000);
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.mocked(getDb).mockReturnValue(
    db as unknown as NonNullable<ReturnType<typeof getDb>>,
  );
  vi.mocked(getViewer).mockResolvedValue(actor);
  await pg.exec(
    `DROP SCHEMA IF EXISTS neon_auth CASCADE; DELETE FROM user_profiles; DELETE FROM user_roles; INSERT INTO user_roles(user_id,role) VALUES ('actor','admin')`,
  );
});
afterAll(async () => {
  await pg.close();
});
async function authSchema() {
  await pg.exec(
    'CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user"(id uuid PRIMARY KEY,name text,email text,"createdAt" timestamptz,password_hash text,session_secret text)',
  );
}
async function account(
  n: number,
  name: string | null = "Account",
  email: string | null = "person@example.test",
  date: string | null = "2026-11-10T12:00:00.000001Z",
) {
  await pg.query(
    `INSERT INTO neon_auth."user"(id,name,email,"createdAt",password_hash,session_secret) VALUES ($1,$2,$3,$4,'secret-hash','secret-session')`,
    [id(n), name, email, date],
  );
}
async function profile(
  n: number,
  name: string | null = "Profile",
  email: string | null = "profile@example.test",
) {
  await pg.query(
    "INSERT INTO user_profiles(user_id,display_name,email,created_at) VALUES ($1,$2,$3,'2026-11-15T12:00:00.000001Z')",
    [id(n), name, email],
  );
}
it.each(["owner", "admin"])(
  "allows %s with current-session identity",
  async (role) => {
    await pg.query("UPDATE user_roles SET role=$1 WHERE user_id='actor'", [
      role,
    ]);
    expect((await readUserDirectory()).total).toBe(0);
  },
);
it.each(["analyst", "player", null])(
  "denies %s before any directory query",
  async (role) => {
    if (role === null)
      await pg.exec("DELETE FROM user_roles WHERE user_id='actor'");
    else
      await pg.query("UPDATE user_roles SET role=$1 WHERE user_id='actor'", [
        role,
      ]);
    const execute = vi.spyOn(db, "execute");
    await expect(readUserDirectory()).rejects.toThrow(/^NOT_FOUND$/);
    expect(execute).not.toHaveBeenCalled();
  },
);
it("denies signed-out, spoofed and premium identities and follows downgrade", async () => {
  await pg.exec("UPDATE user_roles SET role='owner' WHERE user_id='actor'");
  await readUserDirectory();
  await pg.exec("UPDATE user_roles SET role='player' WHERE user_id='actor'");
  vi.mocked(getViewer).mockResolvedValue({
    ...actor,
    premium: true,
    role: "owner",
    requestedUserId: "another-owner",
  } as Viewer);
  await expect(readUserDirectory()).rejects.toThrow("NOT_FOUND");
  vi.mocked(getViewer).mockResolvedValue({ ...actor, authenticated: false });
  await expect(readUserDirectory()).rejects.toThrow("NOT_FOUND");
});
it("fails closed on missing or failed role database and invalid role data", async () => {
  const execute = vi.fn();
  vi.mocked(getDb).mockReturnValue({
    execute,
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ role: "superadmin" }] }),
      }),
    }),
  } as unknown as NonNullable<ReturnType<typeof getDb>>);
  await expect(readUserDirectory()).rejects.toThrow("NOT_FOUND");
  expect(execute).not.toHaveBeenCalled();
  vi.mocked(getDb).mockReturnValue(null);
  await expect(readUserDirectory()).rejects.toThrow("NOT_FOUND");
  vi.mocked(getDb).mockImplementation(() => {
    throw new Error("raw credentials");
  });
  await expect(readUserDirectory()).rejects.toThrow("NOT_FOUND");
});
it("enumerates Auth accounts without profiles and returns only approved fields", async () => {
  await authSchema();
  await account(1, "Auth Name", "auth@example.test");
  await account(2, null, null, null);
  await profile(1, "Custom Name", "outdated@example.test");
  await pg.query("INSERT INTO user_roles(user_id,role) VALUES ($1,'analyst')", [
    id(1),
  ]);
  const execute = vi.spyOn(db, "execute");
  const result = await readUserDirectory();
  expect(result.source.kind).toBe("auth");
  expect(result.source.dateLabel).toBe("Joined");
  expect(result.total).toBe(2);
  expect(result.entries[0]).toEqual({
    userId: id(1),
    displayName: "Custom Name",
    email: "auth@example.test",
    role: "analyst",
    createdAt: "2026-11-10T12:00:00.000001Z",
  });
  expect(result.entries[1]).toEqual({
    userId: id(2),
    displayName: null,
    email: null,
    role: "player",
    createdAt: null,
  });
  expect(JSON.stringify(result)).not.toMatch(
    /password_hash|session_secret|secret-hash|secret-session|outdated@example/,
  );
  expect(execute).toHaveBeenCalledTimes(2);
});
it("uses an honest profile directory when managed enumeration is unavailable", async () => {
  await profile(1);
  const result = await readUserDirectory();
  expect(result.source.kind).toBe("profiles");
  expect(result.source.dateLabel).toBe("Profile created");
  expect(result.source.coverage).toContain("not all signups");
  expect(result.total).toBe(1);
  expect(result.entries[0].createdAt).toBe("2026-11-15T12:00:00.000001Z");
});
it("does not assume unverified managed fields or read restricted Auth columns", async () => {
  await pg.exec(
    'CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user"(id uuid PRIMARY KEY,secret text)',
  );
  await pg.query(`INSERT INTO neon_auth."user" VALUES ($1,'secret')`, [id(1)]);
  await profile(1);
  const result = await readUserDirectory();
  expect(result.source.kind).toBe("auth");
  expect(result.source.dateLabel).toBe("Account date unavailable");
  expect(result.entries[0].createdAt).toBeNull();
  expect(result.entries[0].email).toBe("profile@example.test");
});
it("falls back when approved metadata cannot establish complete readable Auth coverage", async () => {
  await authSchema();
  await account(1);
  await profile(2);
  const original = db.execute.bind(db);
  vi.spyOn(db, "execute").mockImplementation((async (
    query: Parameters<typeof db.execute>[0],
  ) => {
    const result = await original(query);
    const typed = result as { rows: Record<string, unknown>[] };
    if (typed.rows[0]?.column_name)
      for (const row of typed.rows) {
        row.readable = false;
        row.complete = false;
      }
    return result;
  }) as unknown as typeof db.execute);
  const result = await readUserDirectory();
  expect(result.source.kind).toBe("profiles");
  expect(result.entries.map((e) => e.userId)).toEqual([id(2)]);
});
it("searches names/emails case-insensitively and IDs exactly with literal wildcard escaping", async () => {
  await profile(1, "ALICE Percent%", "Alice@example.test");
  await profile(2, "Different_under", null);
  expect((await readUserDirectory({ search: "  aLiCe  " })).total).toBe(1);
  expect((await readUserDirectory({ search: id(2) })).entries[0].userId).toBe(
    id(2),
  );
  expect((await readUserDirectory({ search: "t%" })).total).toBe(1);
  expect((await readUserDirectory({ search: "t_" })).total).toBe(1);
  expect((await readUserDirectory({ search: "' OR 1=1 --" })).total).toBe(0);
  expect(
    (await pg.query("SELECT count(*)::int AS count FROM user_profiles"))
      .rows[0],
  ).toEqual({ count: 2 });
});
it("includes implicit and explicit Players in effective-role filters", async () => {
  for (let n = 1; n <= 4; n++) await profile(n);
  await pg.query(
    "INSERT INTO user_roles(user_id,role) VALUES ($1,'owner'),($2,'player'),($3,'admin')",
    [id(1), id(2), id(3)],
  );
  expect(
    (await readUserDirectory({ role: "player" })).entries.map((e) => e.userId),
  ).toEqual([id(4), id(2)]);
  expect((await readUserDirectory({ role: "owner" })).total).toBe(1);
});
it("rejects oversized searches, invalid filters and unbounded pagination before data queries", async () => {
  const execute = vi.spyOn(db, "execute");
  for (const input of [
    { search: "x".repeat(121) },
    { search: "x" },
    { role: "superadmin" },
    { pageSize: "1000" },
    { pageSize: 0 },
    { direction: "bad" },
  ])
    await expect(readUserDirectory(input)).rejects.toThrow("Choose a valid");
  expect(execute).not.toHaveBeenCalled();
});
it("uses deterministic keyset navigation with microsecond ties, combined filters and filter resets", async () => {
  await authSchema();
  for (let n = 1; n <= 53; n++)
    await account(
      n,
      `Account ${n}`,
      "member@example.test",
      n === 1 ? null : "2026-11-10T12:00:00.000001Z",
    );
  const first = await readUserDirectory({ search: "member", role: "player" });
  expect(first.entries).toHaveLength(25);
  expect(first.total).toBe(53);
  expect(first.previousCursor).toBeNull();
  const second = await readUserDirectory({
    search: "member",
    role: "player",
    cursor: first.nextCursor!,
    direction: "next",
  });
  expect(second.entries).toHaveLength(25);
  expect(second.entries[0].userId).toBe(id(28));
  const last = await readUserDirectory({
    search: "member",
    role: "player",
    cursor: second.nextCursor!,
    direction: "next",
  });
  expect(last.entries).toHaveLength(3);
  expect(last.entries.at(-1)!.createdAt).toBeNull();
  expect(last.nextCursor).toBeNull();
  const back = await readUserDirectory({
    search: "member",
    role: "player",
    cursor: second.previousCursor!,
    direction: "previous",
  });
  expect(back.entries).toEqual(first.entries);
  const reset = await readUserDirectory({
    search: "no-match",
    cursor: first.nextCursor!,
    direction: "next",
  });
  expect(reset.total).toBe(0);
  expect((await readUserDirectory({ pageSize: 50 })).entries).toHaveLength(50);
});
it("never exposes raw database failures or records in errors", async () => {
  vi.spyOn(db, "execute").mockRejectedValue(
    new Error("postgres://password private@example.test raw SQL"),
  );
  await expect(readUserDirectory()).rejects.toThrow(
    /^The user directory is temporarily unavailable/,
  );
});
it("parameterizes user terms and only uses SELECTs and bounded set-based joins", async () => {
  await profile(1);
  const execute = vi.spyOn(db, "execute");
  await readUserDirectory({ search: "someone@example.test" });
  const compiled = execute.mock.calls.map(([query]) =>
    typeof query === "string"
      ? { sql: query, params: [] }
      : new PgDialect().sqlToQuery(query.getSQL()),
  );
  expect(compiled[1].params).toContain("%someone@example.test%");
  expect(compiled[1].params).toContain(25);
  expect(compiled[1].sql).not.toContain("someone@example.test");
  expect(
    compiled.every((q) => !/INSERT|UPDATE|DELETE|GRANT|SET ROLE/.test(q.sql)),
  ).toBe(true);
});

it("preserves pagination when all completion dates are unavailable and treats backslashes literally", async () => {
  await authSchema();
  for (let n = 1; n <= 30; n++) await account(n, "Account", null, null);
  const first = await readUserDirectory();
  const next = await readUserDirectory({
    cursor: first.nextCursor!,
    direction: "next",
  });
  expect(next.entries).toHaveLength(5);
  const back = await readUserDirectory({
    cursor: next.previousCursor!,
    direction: "previous",
  });
  expect(back.entries).toEqual(first.entries);
  const slash = String.fromCharCode(92);
  await pg.query('UPDATE neon_auth."user" SET name=$1 WHERE id=$2', [
    `Path${slash}Name`,
    id(1),
  ]);
  expect(
    (await readUserDirectory({ search: `${slash}N` })).entries.map(
      (e) => e.userId,
    ),
  ).toEqual([id(1)]);
});

it("does not label an RLS-filtered Auth view as a complete account directory", async () => {
  await authSchema();
  await account(1);
  await profile(2);
  await pg.exec(`ALTER TABLE neon_auth."user" ENABLE ROW LEVEL SECURITY;
   CREATE ROLE directory_limited_reader NOLOGIN;
   GRANT USAGE ON SCHEMA public,neon_auth TO directory_limited_reader;
   GRANT SELECT ON user_roles,user_profiles,neon_auth."user" TO directory_limited_reader;
   CREATE POLICY limited_accounts ON neon_auth."user" FOR SELECT TO directory_limited_reader USING (false);`);
  try {
    await pg.exec("SET ROLE directory_limited_reader");
    const result = await readUserDirectory();
    expect(result.source.kind).toBe("profiles");
    expect(result.entries.map((e) => e.userId)).toEqual([id(2)]);
  } finally {
    await pg.exec("RESET ROLE");
  }
});

it.each(["auth", "profiles"])(
  "reads explicit and implicit role snapshots from %s without bigint precision loss",
  async (source) => {
    if (source === "auth") {
      await authSchema();
      await account(1);
      await account(2);
    } else {
      await profile(1);
      await profile(2);
    }
    await pg.query(
      "INSERT INTO public.user_roles(user_id,role,role_revision) VALUES ($1,'player',9007199254740993)",
      [id(1)],
    );
    const { entries } = await readUserDirectory({ role: "player" }, true);
    expect(
      entries.find((entry) => entry.userId === id(1))?.roleSnapshot,
    ).toEqual({
      effectiveRole: "player",
      storedRole: "player",
      roleRevision: "9007199254740993",
    });
    expect(
      entries.find((entry) => entry.userId === id(2))?.roleSnapshot,
    ).toEqual({
      effectiveRole: "player",
      storedRole: null,
      roleRevision: null,
    });
  },
);
