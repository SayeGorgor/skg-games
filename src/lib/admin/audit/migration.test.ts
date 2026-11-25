import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { readAuditSql } from "../../../../scripts/lib/audit-reader-verification";

const pg = new PGlite();
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const query = (...values: unknown[]) =>
  pg.query(
    readAuditSql,
    Array.from({ length: 10 }, (_, i) => values[i] ?? (i === 9 ? 25 : null)),
  );
const migration = (name: string) =>
  readFileSync(`drizzle/${name}.sql`, "utf8").replaceAll(
    "--> statement-breakpoint",
    "",
  );
const first = "2026-11-18T00:00:00.123456Z";

beforeAll(async () => {
  await pg.exec(`CREATE ROLE neondb_owner;
    CREATE ROLE skg_app LOGIN NOINHERIT;
    CREATE ROLE skg_role_writer LOGIN NOINHERIT;
    CREATE ROLE skg_audit_reader LOGIN NOINHERIT;
    GRANT CREATE ON SCHEMA public TO neondb_owner;
    GRANT CREATE ON DATABASE postgres TO neondb_owner;
    SET SESSION AUTHORIZATION neondb_owner;
    CREATE TYPE public.app_role AS ENUM ('owner','admin','analyst','player');
    CREATE SCHEMA skg_private;
    REVOKE ALL ON SCHEMA skg_private FROM PUBLIC;
    CREATE FUNCTION skg_private.assign_application_role(text,text,text,text,bigint) RETURNS text LANGUAGE SQL AS 'SELECT NULL::text';
    REVOKE ALL ON FUNCTION skg_private.assign_application_role(text,text,text,text,bigint) FROM PUBLIC;
    GRANT USAGE ON SCHEMA skg_private TO skg_role_writer;
    GRANT EXECUTE ON FUNCTION skg_private.assign_application_role(text,text,text,text,bigint) TO skg_role_writer;`);
  await pg.exec(migration("0007_role_assignment_audit"));
  await pg.exec(migration("0009_admin_audit_reader"));
}, 20000);
afterAll(async () => {
  await pg.close();
});

it("runs the additive migration and returns an empty bounded result", async () => {
  await pg.exec("SET SESSION AUTHORIZATION skg_audit_reader");
  expect((await query()).rows).toEqual([]);
  await pg.exec("RESET SESSION AUTHORIZATION");
});

it("paginates exact timestamp ties, applies filters, and leaves events and RLS intact", async () => {
  await pg.exec("SET SESSION AUTHORIZATION neondb_owner");
  for (const [event, actor, target, previous, next, time] of [
    [1, null, id(90), null, "owner", "2026-10-01T10:00:00Z"],
    [2, id(90), id(91), "player", "analyst", first],
    [3, id(90), id(91), null, "analyst", first],
    [4, id(92), id(93), "analyst", "player", "2026-11-18T00:00:00.123455Z"],
  ]) {
    await pg.query(
      `INSERT INTO public.role_assignment_audit
      (id,actor_type,actor_user_id,target_user_id,previous_role,new_role,action,created_at,operator_reference)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id(Number(event)),
        actor ? "authenticated_admin" : "system_bootstrap",
        actor,
        target,
        previous,
        next,
        actor ? "role_assignment" : "owner_bootstrap",
        time,
        actor ? null : "private-reference",
      ],
    );
  }
  await pg.exec("SET SESSION AUTHORIZATION skg_audit_reader; BEGIN READ ONLY");
  const rows = (await query()).rows as {
    id: string;
    previous_role: string | null;
    actor_user_id: string | null;
  }[];
  expect(rows.map((row) => row.id)).toEqual([id(3), id(2), id(4), id(1)]);
  expect(rows.map((row) => row.previous_role)).toEqual([
    null,
    "player",
    "analyst",
    null,
  ]);
  expect(rows.at(-1)?.actor_user_id).toBeNull();
  expect(JSON.stringify(rows)).not.toContain("operator_reference");
  const ids = async (...args: unknown[]) =>
    (await query(...args)).rows.map((row) => (row as { id: string }).id);
  expect(
    await ids(null, null, null, null, null, null, null, null, null, 2),
  ).toEqual([id(3), id(2)]);
  expect(
    await ids(null, null, null, null, null, null, null, first, id(2), 2),
  ).toEqual([id(4), id(1)]);
  expect(
    await ids(
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "2026-10-01T10:00:00Z",
      id(1),
      2,
    ),
  ).toEqual([]);
  expect(await ids("owner_bootstrap")).toEqual([id(1)]);
  expect(
    await ids(
      "role_assignment",
      id(90),
      id(91),
      "2026-11-18",
      "2026-11-19",
      "implicit",
      "analyst",
    ),
  ).toEqual([id(3)]);
  expect(
    await ids(null, id(90), null, null, null, "player", "analyst"),
  ).toEqual([id(2)]);
  expect((await query()).rows).toEqual(rows);
  await pg.exec("ROLLBACK; RESET SESSION AUTHORIZATION");
  const {
    rows: [flags],
  } = await pg.query(`SELECT relrowsecurity,
    NOT has_function_privilege('skg_app','skg_private.list_role_audit_events(text,text,text,timestamptz,timestamptz,text,public.app_role,timestamptz,uuid,integer)','EXECUTE') AS runtime_denied,
    NOT has_function_privilege('skg_role_writer','skg_private.list_role_audit_events(text,text,text,timestamptz,timestamptz,text,public.app_role,timestamptz,uuid,integer)','EXECUTE') AS writer_denied,
    NOT has_function_privilege('skg_audit_reader','skg_private.assign_application_role(text,text,text,text,bigint)','EXECUTE') AS mutation_denied
    FROM pg_class WHERE oid='public.role_assignment_audit'::regclass`);
  expect(flags).toEqual({
    relrowsecurity: true,
    runtime_denied: true,
    writer_denied: true,
    mutation_denied: true,
  });
});

it("rejects invalid actions, date intervals, cursors and oversized pages", async () => {
  for (const params of [
    ["delete"],
    [null, "invalid"],
    [null, null, null, "2020-01-01", "2026-01-01"],
    [null, null, null, null, null, null, null, first],
    [null, null, null, null, null, null, null, null, null, 27],
    [null, null, null, null, null, null, null, null, null, 0],
  ])
    await expect(query(...params)).rejects.toMatchObject({ code: "22023" });
});
