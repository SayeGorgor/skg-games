import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const owner = "00000000-0000-4000-8000-000000000001";
const target = "00000000-0000-4000-8000-000000000002";
// PGlite's session identity cannot be replaced. Exercise the same SQL with the
// migration's operator guard adjusted only for this isolated in-memory fixture.
beforeAll(async () => {
  await db.exec(`CREATE ROLE neondb_owner LOGIN; CREATE ROLE skg_role_writer LOGIN NOINHERIT;
    CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user"(id uuid primary key);
    GRANT SELECT, UPDATE ON neon_auth."user" TO neondb_owner;
    CREATE TYPE public.app_role AS ENUM ('owner','admin','analyst','player');
    CREATE TABLE public.user_roles(user_id text primary key,role public.app_role not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
    CREATE TABLE public.role_assignment_audit(id uuid default gen_random_uuid() primary key,actor_type text not null,actor_user_id text,operator_reference text,target_user_id text not null,previous_role public.app_role,new_role public.app_role not null,action text not null,created_at timestamptz default now());
    ALTER TABLE public.role_assignment_audit ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.user_roles OWNER TO neondb_owner; ALTER TABLE public.role_assignment_audit OWNER TO neondb_owner;
    INSERT INTO neon_auth."user" VALUES ('${target}'); INSERT INTO public.user_roles(user_id,role) VALUES ('${owner}','owner');`);
  const migration = readFileSync("drizzle/0008_role_change_engine.sql", "utf8")
    .replace(
      "current_user <> 'neondb_owner' OR session_user <> 'neondb_owner'",
      "false",
    )
    .replaceAll(
      "relowner=current_user::regrole",
      "relowner='neondb_owner'::regrole",
    )
    .replace(
      "has_table_privilege(current_user, 'neon_auth.\"user\"'",
      "has_table_privilege('neondb_owner', 'neon_auth.\"user\"'",
    );
  await db.exec(migration);
});
afterAll(async () => {
  await db.close();
});
it("promotes an implicit player, audits once, and rejects the stale replay", async () => {
  const sql =
    "SELECT skg_private.assign_application_role($1,$2,$3,$4,$5) AS status";
  expect(
    (await db.query(sql, [owner, target, "analyst", null, null])).rows[0],
  ).toEqual({ status: "success" });
  expect(
    (await db.query(sql, [owner, target, "analyst", null, null])).rows[0],
  ).toEqual({ status: "stale_state" });
  expect(
    (
      await db.query(
        "SELECT role::text,role_revision::text FROM public.user_roles WHERE user_id=$1",
        [target],
      )
    ).rows[0],
  ).toEqual({ role: "analyst", role_revision: "1" });
  const audit = await db.query(
    "SELECT actor_user_id,previous_role::text,new_role::text FROM public.role_assignment_audit",
  );
  expect(audit.rows).toEqual([
    { actor_user_id: owner, previous_role: null, new_role: "analyst" },
  ]);
});
it("protects self and owner and rejects missing identities", async () => {
  const sql =
    "SELECT skg_private.assign_application_role($1,$2,$3,$4,$5) AS status";
  expect(
    (await db.query(sql, [owner, owner, "player", "owner", "0"])).rows[0],
  ).toEqual({ status: "forbidden" });
  expect(
    (
      await db.query(sql, [
        owner,
        "00000000-0000-4000-8000-000000000003",
        "admin",
        null,
        null,
      ])
    ).rows[0],
  ).toEqual({ status: "not_found" });
});

it("rolls the role update back when audit insertion fails", async () => {
  await db.exec(`CREATE FUNCTION public.reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test'; END $$;
    CREATE TRIGGER reject_test_audit BEFORE INSERT ON public.role_assignment_audit FOR EACH ROW EXECUTE FUNCTION public.reject_test_audit();`);
  await expect(
    db.query("SELECT skg_private.assign_application_role($1,$2,$3,$4,$5)", [
      owner,
      target,
      "player",
      "analyst",
      "1",
    ]),
  ).rejects.toThrow();
  expect(
    (
      await db.query(
        "SELECT role::text,role_revision::text FROM public.user_roles WHERE user_id=$1",
        [target],
      )
    ).rows[0],
  ).toEqual({ role: "analyst", role_revision: "1" });
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM public.role_assignment_audit",
      )
    ).rows[0],
  ).toEqual({ n: 1 });
  await db.exec(
    "DROP TRIGGER reject_test_audit ON public.role_assignment_audit; DROP FUNCTION public.reject_test_audit()",
  );
});
it("stores an explicit player and rejects a repeated submission", async () => {
  const sql =
    "SELECT skg_private.assign_application_role($1,$2,$3,$4,$5) AS status";
  expect(
    (await db.query(sql, [owner, target, "player", "analyst", "1"])).rows[0],
  ).toEqual({ status: "success" });
  expect(
    (await db.query(sql, [owner, target, "player", "analyst", "1"])).rows[0],
  ).toEqual({ status: "stale_state" });
  expect(
    (
      await db.query(
        "SELECT role::text,role_revision::text FROM public.user_roles WHERE user_id=$1",
        [target],
      )
    ).rows[0],
  ).toEqual({ role: "player", role_revision: "2" });
});

it("matches the central transition matrix for all actor, target, and destination roles", async () => {
  const { evaluateRoleTransition } = await import("./role-policy");
  const roles = ["owner", "admin", "analyst", "player"] as const;
  for (const actorRole of roles)
    for (const targetRole of roles)
      for (const requestedRole of roles) {
        await db.query(
          "DELETE FROM public.user_roles WHERE user_id IN ($1,$2)",
          [owner, target],
        );
        await db.query(
          "INSERT INTO public.user_roles(user_id,role) VALUES ($1,$2),($3,$4)",
          [owner, actorRole, target, targetRole],
        );
        const decision = evaluateRoleTransition({
          actorId: owner,
          actorRole,
          targetId: target,
          targetRole,
          requestedRole,
        });
        const result = await db.query(
          "SELECT skg_private.assign_application_role($1,$2,$3,$4,$5) AS status",
          [owner, target, requestedRole, targetRole, "0"],
        );
        expect(result.rows[0]).toEqual({
          status: decision.allowed
            ? "success"
            : decision.reason === "no_op"
              ? "no_change"
              : "forbidden",
        });
      }
});

it("restricts execution to the writer and denies direct table access", async () => {
  const p = await db.query(`SELECT
    has_schema_privilege('skg_role_writer','skg_private','USAGE') AS usage,
    has_function_privilege('skg_role_writer','skg_private.assign_application_role(text,text,text,text,bigint)','EXECUTE') AS execute,
    has_table_privilege('skg_role_writer','public.user_roles','UPDATE') AS role_write,
    has_table_privilege('skg_role_writer','public.role_assignment_audit','SELECT') AS audit_read,
    EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='skg_private.assign_application_role(text,text,text,text,bigint)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute`);
  expect(p.rows[0]).toEqual({
    usage: true,
    execute: true,
    role_write: false,
    audit_read: false,
    public_execute: false,
  });
});
