import { runtimeGrants } from "./runtime-grants";
export type DiagnosticSql = {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
};
type Check = { check: string; passed: boolean };
export async function verifyRuntime(
  db: DiagnosticSql,
  expectedDatabase: string,
): Promise<Check[]> {
  const checks: Check[] = [];
  const check = (name: string, passed: boolean) =>
    checks.push({ check: name, passed });
  const {
    rows: [identity],
  } =
    await db.query(`SELECT current_database() AS db, current_user AS role, session_user AS session,
    r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit) AS restricted,
    NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS no_memberships,
    NOT EXISTS (SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid AND deptype='o') AS no_ownership,
    has_database_privilege(current_database(),'CONNECT') AS connect,
    NOT has_database_privilege(current_database(),'CREATE') AS no_database_create
    FROM pg_roles r WHERE rolname=current_user`);
  check(
    "identity and restricted role",
    identity?.db === expectedDatabase &&
      identity.role === "skg_app" &&
      identity.session === "skg_app" &&
      identity.restricted === true &&
      identity.no_memberships === true &&
      identity.no_ownership === true &&
      identity.connect === true &&
      identity.no_database_create === true,
  );
  if (!checks[0].passed) return checks; // Never probe with owner/operator credentials.
  const { rows: schemas } =
    await db.query(`SELECT nspname, has_schema_privilege(oid,'CREATE') AS can_create,
    has_schema_privilege(oid,'USAGE') AS can_use FROM pg_namespace
    WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'`);
  check(
    "schema usage/create",
    schemas.some((s) => s.nspname === "public" && s.can_use === true) &&
      schemas.every((s) => s.can_create === false),
  );
  const { rows: tables } =
    await db.query(`SELECT n.nspname AS schema,c.relname AS name,c.relrowsecurity AS rls,
    row_security_active(c.oid) AS rls_active, a.attname AS column,
    has_column_privilege(c.oid,a.attnum,'SELECT') AS sel,
    has_column_privilege(c.oid,a.attnum,'INSERT') AS ins,
    has_column_privilege(c.oid,a.attnum,'UPDATE') AS upd,
    (has_column_privilege(c.oid,a.attnum,'SELECT WITH GRANT OPTION') OR
     has_column_privilege(c.oid,a.attnum,'INSERT WITH GRANT OPTION') OR
     has_column_privilege(c.oid,a.attnum,'UPDATE WITH GRANT OPTION')) AS grantable,
    (has_table_privilege(c.oid,'DELETE') OR has_table_privilege(c.oid,'TRUNCATE') OR
     has_table_privilege(c.oid,'REFERENCES') OR has_table_privilege(c.oid,'TRIGGER') OR
     has_column_privilege(c.oid,a.attnum,'REFERENCES')) AS other
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'`);
  for (const [name, grants] of Object.entries(runtimeGrants)) {
    const columns = tables.filter(
      (t) => t.schema === "public" && t.name === name,
    );
    check(
      `exact grants: ${name}`,
      columns.length > 0 &&
        columns.every(
          (t) =>
            t.sel === !!grants.select &&
            t.ins === !!grants.insert &&
            t.upd === !!grants.update?.includes(String(t.column)) &&
            t.other === false &&
            t.grantable === false &&
            t.rls === false,
        ),
    );
  }
  check(
    "no unlisted table/column access",
    tables
      .filter(
        (t) =>
          t.schema !== "public" ||
          !Object.hasOwn(runtimeGrants, String(t.name)),
      )
      .every((t) => !t.sel && !t.ins && !t.upd && !t.other && !t.grantable),
  );
  const audit = tables.filter(
    (t) => t.schema === "public" && t.name === "role_assignment_audit",
  );
  check(
    "audit RLS active",
    audit.length > 0 &&
      audit.every((t) => t.rls === true && t.rls_active === true),
  );
  const {
    rows: [surface],
  } = await db.query(`SELECT
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND has_schema_privilege(n.oid,'USAGE') AND has_function_privilege(p.oid,'EXECUTE')) AS functions_closed,
    NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind='S' AND n.nspname NOT LIKE 'pg_%' AND
      (has_sequence_privilege(c.oid,'USAGE') OR has_sequence_privilege(c.oid,'SELECT') OR has_sequence_privilege(c.oid,'UPDATE'))) AS sequences_closed,
    NOT EXISTS (SELECT 1 FROM pg_default_acl d, LATERAL aclexplode(d.defaclacl) a
      WHERE a.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname=current_user))
      AND d.defaclobjtype IN ('r','S','f')) AS defaults_closed`);
  check("custom function execution closed", surface?.functions_closed === true);
  check("no sequence grants required", surface?.sequences_closed === true);
  check("no broad future default ACLs", surface?.defaults_closed === true);
  if (checks.some((c) => !c.passed)) return checks;
  // Read results intentionally discarded. Never output application data.
  for (const [name, grants] of Object.entries(runtimeGrants))
    if (grants.select) {
      try {
        await db.query(`SELECT * FROM public.${name} LIMIT 0`);
        check(`read: ${name}`, true);
      } catch {
        check(`read: ${name}`, false);
      }
    }
  const probes = [
    [
      "role INSERT",
      "INSERT INTO public.user_roles(user_id,role) SELECT 'synthetic-probe','player'::public.app_role WHERE false",
    ],
    ["role UPDATE", "UPDATE public.user_roles SET role='player' WHERE false"],
    ["role DELETE", "DELETE FROM public.user_roles WHERE false"],
    ["audit SELECT", "SELECT * FROM public.role_assignment_audit LIMIT 0"],
    [
      "audit INSERT",
      "INSERT INTO public.role_assignment_audit(actor_type,target_user_id,new_role,action) SELECT 'probe','probe','player'::public.app_role,'probe' WHERE false",
    ],
    [
      "audit UPDATE",
      "UPDATE public.role_assignment_audit SET action='probe' WHERE false",
    ],
    ["audit DELETE", "DELETE FROM public.role_assignment_audit WHERE false"],
    ["schema CREATE", "CREATE SCHEMA skg_denial_probe"],
    [
      "security table ALTER",
      "ALTER TABLE public.user_roles ADD COLUMN skg_denial_probe boolean",
    ],
    ["privileged SET ROLE", "SET ROLE neondb_owner"],
  ];
  for (const [name, sql] of probes) {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL statement_timeout='3s'");
      await db.query("SET LOCAL lock_timeout='1s'");
      try {
        await db.query(sql);
        check(`denied: ${name}`, false);
      } catch (error) {
        check(`denied: ${name}`, (error as { code?: string }).code === "42501");
      }
    } finally {
      await db.query("ROLLBACK");
    }
  }
  return checks;
}
