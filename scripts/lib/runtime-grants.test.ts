import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { runtimeGrantSql } from "./runtime-grants";
import { verifyRuntime } from "./runtime-verification";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: null }));
vi.mock("@sentry/nextjs", () => ({ logger: { info: vi.fn() } }));
import { getDb } from "@/lib/db";
import { ensureProfileForAuthUser } from "@/lib/auth/viewer";
import { recordAttempt } from "@/lib/db/attempts";
import { claimAnonymousProgress } from "@/lib/auth/claim";
import { publishDueChallenges } from "@/lib/db/challenges";
const pg = new PGlite();
beforeAll(async () => {
  for (const file of readdirSync("drizzle")
    .filter(
      (f) =>
        /^\d+.*\.sql$/.test(f) &&
        ![
          "0008_role_change_engine.sql",
          "0009_admin_audit_reader.sql",
        ].includes(f),
    )
    .sort())
    await pg.exec(
      readFileSync(`drizzle/${file}`, "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
  await pg.exec(`CREATE ROLE neondb_owner NOLOGIN;
    CREATE ROLE skg_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO skg_app;
    ${runtimeGrantSql()}
    INSERT INTO public.games(slug,name,description) VALUES ('perfect-stack','Synthetic','Synthetic');
    INSERT INTO public.daily_challenges(game_id,challenge_date,challenge_number) SELECT id,'2000-01-01',1 FROM games;
    CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user"(id uuid,password text);
    SET SESSION AUTHORIZATION skg_app;`);
  const db = drizzle(pg);
  // Adapt only the driver's batch transport; every statement executes against
  // actual PostgreSQL permissions in one isolated transaction.
  Object.assign(db, {
    batch: async (queries: { toSQL(): { sql: string; params: unknown[] } }[]) =>
      pg.transaction(async (tx) => {
        const result = [];
        for (const query of queries) {
          const built = query.toSQL();
          result.push(
            (await tx.query(built.sql, built.params)).rows.map((row) =>
              Object.fromEntries(
                Object.entries(row as Record<string, unknown>).map(
                  ([key, value]) => [
                    key.replace(/_([a-z])/g, (_, letter: string) =>
                      letter.toUpperCase(),
                    ),
                    value,
                  ],
                ),
              ),
            ),
          );
        }
        return result;
      }),
  });
  vi.mocked(getDb).mockReturnValue(
    db as unknown as NonNullable<ReturnType<typeof getDb>>,
  );
}, 30000);
afterAll(async () => {
  await pg.close();
});
it("reviewed provisioning SQL exactly matches the explicit code-derived grants", () => {
  const sql = readFileSync("scripts/database/provision-runtime.sql", "utf8");
  expect(
    sql
      .split("-- BEGIN generated runtime grants\n")[1]
      .split("-- END generated runtime grants")[0]
      .trim(),
  ).toBe(runtimeGrantSql());
  expect(sql).toContain(
    "Existing skg_app requires independent privilege review",
  );
  expect(sql).not.toMatch(
    /GRANT ALL|ALTER DEFAULT|GRANT .*neon_auth|PASSWORD '/,
  );
});
it("runs real profile creation/email upsert, attempt persistence, anonymous claiming and cron under exact grants", async () => {
  await ensureProfileForAuthUser({
    id: "synthetic-user",
    name: "Synthetic",
    email: "first@example.test",
  });
  await ensureProfileForAuthUser({
    id: "synthetic-user",
    email: "second@example.test",
  });
  const rows = await pg.query<{ email: string }>(
    "SELECT email FROM public.user_profiles WHERE user_id='synthetic-user'",
  );
  expect(rows.rows[0].email).toBe("second@example.test");
  expect(
    await recordAttempt({
      gameSlug: "perfect-stack",
      challengeNumber: 1,
      mode: "daily",
      solved: true,
      moves: 3,
      durationMs: 100,
      anonymousId: "00000000-0000-4000-8000-000000000001",
      result: {},
      verified: true,
    }),
  ).toBe(true);
  expect(
    (
      await claimAnonymousProgress(
        "synthetic-user",
        "00000000-0000-4000-8000-000000000001",
      )
    ).claimed,
  ).toBe(true);
  expect(await publishDueChallenges()).toBe(1);
});
it("denies role/audit mutation, managed Auth secrets, schema DDL and membership escalation", async () => {
  for (const sql of [
    "INSERT INTO public.user_roles(user_id,role) VALUES ('probe','owner')",
    "UPDATE public.user_roles SET role='owner' WHERE false",
    "DELETE FROM public.user_roles WHERE false",
    "SELECT * FROM public.role_assignment_audit LIMIT 0",
    "INSERT INTO public.role_assignment_audit(actor_type,target_user_id,new_role,action) VALUES ('x','x','player','x')",
    "UPDATE public.role_assignment_audit SET action='x' WHERE false",
    "DELETE FROM public.role_assignment_audit WHERE false",
    'SELECT password FROM neon_auth."user" LIMIT 0',
    "CREATE SCHEMA forbidden_schema",
    "ALTER TABLE public.user_roles ADD COLUMN forbidden boolean",
    "SET ROLE postgres",
  ])
    await expect(pg.exec(sql)).rejects.toThrow(
      /permission denied|must be owner/,
    );
});
it("missing grants are detectable and new migrations receive no implicit runtime writes", async () => {
  await expect(
    pg.exec("SELECT * FROM public.user_game_stats LIMIT 0"),
  ).rejects.toThrow(/permission denied/);
  await expect(
    pg.exec(
      "UPDATE public.user_profiles SET preferred_theme='dark' WHERE false",
    ),
  ).rejects.toThrow(/permission denied/);
});
it("executes diagnostic metadata and real denial probes under restricted session authorization", async () => {
  const identity = await pg.query<{ db: string }>(
    "SELECT current_database() AS db",
  );
  const checks = await verifyRuntime(
    {
      query: async (sql, params) =>
        pg.query<Record<string, unknown>>(sql, params),
    },
    identity.rows[0].db,
  );
  expect(checks.filter((c) => !c.passed)).toEqual([]);
  expect(checks.some((c) => c.check === "denied: audit INSERT")).toBe(true);
  expect(checks.some((c) => c.check === "denied: privileged SET ROLE")).toBe(
    true,
  );
});
