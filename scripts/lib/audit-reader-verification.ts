import type { DiagnosticSql } from "./runtime-verification";

const readerFunction =
  "skg_private.list_role_audit_events(text,text,text,timestamptz,timestamptz,text,public.app_role,timestamptz,uuid,integer)";
const writerFunction =
  "skg_private.assign_application_role(text,text,text,text,bigint)";
export const readAuditSql = `SELECT * FROM skg_private.list_role_audit_events(
  $1::text,$2::text,$3::text,$4::timestamptz,$5::timestamptz,$6::text,
  $7::public.app_role,$8::timestamptz,$9::uuid,$10::int)`;

export async function verifyAuditReader(
  db: DiagnosticSql,
  expectedDatabase: string,
) {
  const checks: { check: string; passed: boolean }[] = [];
  const check = (name: string, passed: unknown) =>
    checks.push({ check: name, passed: passed === true });
  const {
    rows: [identity],
  } = await db.query(`SELECT current_database() AS db,
    current_user AS role, session_user AS session,
    r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit) AS restricted,
    NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS no_memberships,
    NOT EXISTS (SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid AND deptype='o') AS no_ownership,
    NOT has_database_privilege(current_database(),'CREATE') AS no_database_create
    FROM pg_roles r WHERE rolname=current_user`);
  check(
    "restricted reader identity",
    identity?.db === expectedDatabase &&
      identity.role === "skg_audit_reader" &&
      identity.session === "skg_audit_reader" &&
      identity.restricted &&
      identity.no_memberships &&
      identity.no_ownership &&
      identity.no_database_create,
  );
  if (!checks[0].passed) return checks;
  await db.query(
    "SET statement_timeout='5s'; SET lock_timeout='2s'; SET idle_in_transaction_session_timeout='10s'",
  );
  const {
    rows: [acl],
  } = await db.query(
    `WITH f AS (
    SELECT p.*, n.oid AS schema_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid=to_regprocedure($1)
  ) SELECT
    (SELECT reset_val::bigint BETWEEN 1 AND 5000 FROM pg_settings WHERE name='statement_timeout') AS login_timeout,
    NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema' AND has_schema_privilege(oid,'CREATE')) AS no_schema_create,
    NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND (
        (c.relkind IN ('r','p','v','m','f') AND
          (has_any_column_privilege(c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(c.oid,'DELETE,TRUNCATE,TRIGGER')))
        OR (c.relkind='S' AND has_sequence_privilege(c.oid,'USAGE,SELECT,UPDATE')))) AS no_table_or_sequence_access,
    EXISTS (SELECT 1 FROM f WHERE prosecdef AND provolatile='s'
      AND proowner='neondb_owner'::regrole AND proconfig @> ARRAY['search_path=pg_catalog, pg_temp']
      AND has_schema_privilege(schema_oid,'USAGE') AND has_function_privilege(oid,'EXECUTE')
      AND NOT has_function_privilege(oid,'EXECUTE WITH GRANT OPTION')) AS intended_function,
    (SELECT count(*)=1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='skg_private' AND p.proname='list_role_audit_events') AS no_overloads,
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
      AND has_schema_privilege(n.oid,'USAGE') AND has_function_privilege(p.oid,'EXECUTE')
      AND p.oid IS DISTINCT FROM to_regprocedure($1)) AS no_other_functions,
    EXISTS (SELECT 1 FROM f WHERE NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
      WHERE a.grantee NOT IN (f.proowner,'skg_audit_reader'::regrole))) AS private_function_acl,
    EXISTS (SELECT 1 FROM f WHERE NOT has_function_privilege('skg_app',oid,'EXECUTE')
      AND NOT has_function_privilege('skg_role_writer',oid,'EXECUTE')) AS other_service_roles_denied,
    NOT coalesce(has_function_privilege(to_regprocedure($2),'EXECUTE'),true) AS role_writer_function_denied,
    EXISTS (SELECT 1 FROM pg_class WHERE oid='public.role_assignment_audit'::regclass AND relrowsecurity
      AND NOT relforcerowsecurity AND relowner='neondb_owner'::regrole) AS audit_rls_preserved`,
    [readerFunction, writerFunction],
  );
  for (const [name, passed] of Object.entries(acl)) check(name, passed);
  if (checks.some((result) => !result.passed)) return checks;

  for (const [name, query] of [
    [
      "audit select denied",
      "SELECT id FROM public.role_assignment_audit LIMIT 0",
    ],
    [
      "audit insert denied",
      "INSERT INTO public.role_assignment_audit(action) SELECT 'probe' WHERE false",
    ],
    [
      "audit update denied",
      "UPDATE public.role_assignment_audit SET action='probe' WHERE false",
    ],
    [
      "audit delete denied",
      "DELETE FROM public.role_assignment_audit WHERE false",
    ],
    [
      "role update denied",
      "UPDATE public.user_roles SET role='player' WHERE false",
    ],
    ["privileged role denied", "SET ROLE neondb_owner"],
  ]) {
    await db.query("BEGIN");
    let denied = false;
    try {
      await db.query(query);
    } catch (error) {
      denied = (error as { code?: string }).code === "42501";
    } finally {
      await db.query("ROLLBACK");
    }
    check(name, denied);
  }
  return checks;
}
