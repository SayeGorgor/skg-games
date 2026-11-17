import { Client, neonConfig } from "@neondatabase/serverless";
import { approvedDbTarget } from "./lib/db-target";

async function main() {
  const target = approvedDbTarget(process.env, "ROLE_WRITER_VERIFY");
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const db = new Client({
    connectionString: target.url,
    connectionTimeoutMillis: 10000,
  });
  db.on("error", () => {});
  try {
    await db.connect();
    await db.query("SET lock_timeout='2s'");
    const {
      rows: [identity],
    } =
      await db.query(`SELECT current_database() AS db,current_user AS role,session_user AS session,
      r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit) AS restricted,
      NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS no_memberships,
      NOT EXISTS (SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid AND deptype='o') AS no_ownership,
      NOT has_database_privilege(current_database(),'CREATE') AS no_db_create FROM pg_roles r WHERE rolname=current_user`);
    const identityOk =
      identity?.db === target.database &&
      identity.role === "skg_role_writer" &&
      identity.session === "skg_role_writer" &&
      identity.restricted &&
      identity.no_memberships &&
      identity.no_ownership &&
      identity.no_db_create;
    console.log(`${identityOk ? "PASS" : "FAIL"}: restricted writer identity`);
    if (!identityOk) {
      process.exitCode = 1;
      return;
    }
    const {
      rows: [p],
    } = await db.query(`SELECT
      (SELECT setting::bigint BETWEEN 1 AND 10000 FROM pg_settings WHERE name='statement_timeout') AS bounded_statement_timeout,
      NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND has_schema_privilege(n.oid,'CREATE')) AS no_schema_create,
      NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
       WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
       AND (has_column_privilege(c.oid,a.attnum,'SELECT') OR has_column_privilege(c.oid,a.attnum,'INSERT') OR has_column_privilege(c.oid,a.attnum,'UPDATE') OR has_column_privilege(c.oid,a.attnum,'REFERENCES') OR has_table_privilege(c.oid,'DELETE,TRUNCATE,TRIGGER'))) AS no_table_access,
      EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='skg_private' AND p.oid=to_regprocedure('skg_private.assign_application_role(text,text,text,text,bigint)') AND p.prosecdef AND has_schema_privilege(n.oid,'USAGE') AND has_function_privilege(p.oid,'EXECUTE')) AS function_access,
      NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND has_schema_privilege(n.oid,'USAGE') AND has_function_privilege(p.oid,'EXECUTE') AND p.oid <> coalesce(to_regprocedure('skg_private.assign_application_role(text,text,text,text,bigint)'),0)) AS no_other_functions,
      NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='skg_private' AND a.grantee=0 AND a.privilege_type='EXECUTE') AS no_public_execute,
      NOT coalesce(has_function_privilege('skg_app',to_regprocedure('skg_private.assign_application_role(text,text,text,text,bigint)'),'EXECUTE'),true) AS app_denied`);
    for (const [name, passed] of Object.entries(p)) {
      console.log(`${passed ? "PASS" : "FAIL"}: ${name}`);
      if (!passed) process.exitCode = 1;
    }
    if (process.exitCode) return;
    await db.query("SET statement_timeout='10s'");
    for (const [name, query] of [
      ["role update", "UPDATE public.user_roles SET role='player' WHERE false"],
      ["audit read", "SELECT * FROM public.role_assignment_audit LIMIT 0"],
      [
        "audit insert",
        "INSERT INTO public.role_assignment_audit(actor_type,target_user_id,new_role,action) SELECT 'probe','probe','player','probe' WHERE false",
      ],
      ["schema create", "CREATE SCHEMA skg_writer_denial_probe"],
      ["privileged role", "SET ROLE neondb_owner"],
    ]) {
      await db.query("BEGIN");
      let denied = false;
      try {
        await db.query(query);
      } catch (e) {
        denied = (e as { code?: string }).code === "42501";
      } finally {
        await db.query("ROLLBACK");
      }
      console.log(`${denied ? "PASS" : "FAIL"}: denied ${name}`);
      if (!denied) process.exitCode = 1;
    }
  } finally {
    await db.end();
  }
}
void main().catch(() => {
  console.error(
    "Writer verification refused or failed; inspect the approved target privately.",
  );
  process.exitCode = 1;
});
