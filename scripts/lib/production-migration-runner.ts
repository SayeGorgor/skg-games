import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { matchesDatabaseUrl } from "../../src/lib/db/connection-target";

export const planStart = 8;
const anchor =
  "95a7548c892374e6b1cfadc1655cd302da5e6660fdd3d3e50ffad446a16725d8";
type Mode = "preflight" | "apply";

export function productionTarget(env: NodeJS.ProcessEnv, args: string[]) {
  const mode: Mode | null =
    args.length === 1 && args[0] === "--preflight"
      ? "preflight"
      : args.length === 1 && args[0] === "--apply"
        ? "apply"
        : null;
  const {
    SKG_PROD_MIGRATION_DATABASE_URL: url,
    SKG_PROD_MIGRATION_EXPECTED_HOST: host,
    SKG_PROD_MIGRATION_EXPECTED_DATABASE: database,
    SKG_PROD_MIGRATION_EXPECTED_ROLE: role,
    SKG_PROD_MIGRATION_REVIEWED_REVISION: revision,
  } = env;
  if (
    !mode ||
    env.NODE_ENV !== "production" ||
    (env.VERCEL_ENV && env.VERCEL_ENV !== "production") ||
    env.SKG_PROD_MIGRATION_APPROVED_TARGET !== "yes" ||
    (mode === "apply" && env.SKG_PROD_MIGRATION_APPROVED_APPLY !== "yes") ||
    (mode === "preflight" && env.SKG_PROD_MIGRATION_APPROVED_APPLY) ||
    !url ||
    !host ||
    database !== "neondb" ||
    role !== "neondb_owner" ||
    !revision ||
    !/^[a-f0-9]{40}$/.test(revision) ||
    !/^ep-[a-z0-9-]+\.(?:[a-z0-9-]+\.)+neon\.tech$/.test(host) ||
    host.split(".")[0].endsWith("-pooler") ||
    !matchesDatabaseUrl(url, host, database, role)
  )
    throw new Error("production configuration");
  return { mode, url, database, role, revision };
}

export function frozenProductionPlan(revision: string) {
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  if (
    git("rev-parse", "HEAD") !== revision ||
    git("rev-parse", "--show-prefix") ||
    git("status", "--porcelain", "--untracked-files=all")
  )
    throw new Error("reviewed checkout");
  // This is the dialect/session pair reviewed for transaction ownership below.
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const installed = JSON.parse(
    readFileSync("node_modules/drizzle-orm/package.json", "utf8"),
  );
  if (
    lock.packages["node_modules/drizzle-orm"]?.version !== "0.45.4" ||
    installed.version !== "0.45.4"
  )
    throw new Error("reviewed Drizzle version");
  const { entries } = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  );
  const plan = readMigrationFiles({ migrationsFolder: "drizzle" });
  const tail = [
    ["0007_role_assignment_audit", 1794524753941],
    ["0008_role_change_engine", 1794524753942],
    ["0009_admin_audit_reader", 1794524753943],
  ];
  if (
    plan.length !== 10 ||
    entries.length !== 10 ||
    plan[7].hash !== anchor ||
    entries.some(
      (entry: { idx: number; when: number }, index: number) =>
        entry.idx !== index ||
        !Number.isSafeInteger(entry.when) ||
        (index > 0 && entry.when <= entries[index - 1].when),
    ) ||
    tail.some(
      ([tag, when], index) =>
        entries[index + 7].tag !== tag || plan[index + 7].folderMillis !== when,
    ) ||
    plan.slice(planStart).some(({ sql }) => sql.length !== 1)
  )
    throw new Error("frozen migration plan");
  const migrationPaths = [
    "drizzle/meta/_journal.json",
    ...entries.map(({ tag }: { tag: string }) => `drizzle/${tag}.sql`),
  ];
  for (const path of migrationPaths) {
    const blob = execFileSync("git", ["show", `${revision}:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const checkedOut = readFileSync(path, "utf8");
    if (checkedOut.replaceAll("\r\n", "\n") !== blob.replaceAll("\r\n", "\n"))
      throw new Error("migration differs from reviewed revision");
  }
  return plan;
}

type LedgerRow = { created_at: unknown; hash: unknown };
type Plan = { folderMillis: number; hash: string }[];
export function ledgerState(
  rows: LedgerRow[],
  plan: Plan,
): "pending" | "applied" {
  if (
    (rows.length !== planStart && rows.length !== plan.length) ||
    rows.some(
      (row, index) =>
        String(row.created_at) !== String(plan[index].folderMillis) ||
        row.hash !== plan[index].hash,
    )
  )
    throw new Error("ledger mismatch");
  return rows.length === planStart ? "pending" : "applied";
}

type Connection = {
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
};
const writer =
  "skg_private.assign_application_role(text,text,text,text,bigint)";
const reader =
  "skg_private.list_role_audit_events(text,text,text,timestamptz,timestamptz,text,public.app_role,timestamptz,uuid,integer)";

async function inspect(
  db: Connection,
  target: { database: string; role: string },
  plan: Plan,
) {
  const {
    rows: [identity],
  } =
    await db.query(`SELECT current_database() AS db,current_user AS role,session_user AS session,
    EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('drizzle.__drizzle_migrations')
      AND relkind='r' AND relowner=current_user::regrole AND NOT relrowsecurity
      AND EXISTS (SELECT 1 FROM pg_namespace n WHERE n.oid=pg_class.relnamespace AND n.nspowner=current_user::regrole)
      AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=pg_class.oid AND NOT t.tgisinternal)) AS ledger`);
  if (
    identity?.db !== target.database ||
    identity.role !== target.role ||
    identity.session !== target.role ||
    identity.ledger !== true
  )
    throw new Error("identity and ledger relation");
  const { rows } = await db.query(
    "SELECT created_at::text,hash FROM drizzle.__drizzle_migrations ORDER BY created_at,id LIMIT 11",
  );
  const state = ledgerState(rows as LedgerRow[], plan);
  const {
    rows: [base],
  } = await db.query(`SELECT
    (SELECT count(*)=3 FROM pg_roles r WHERE rolname IN ('skg_app','skg_role_writer','skg_audit_reader')
      AND rolcanlogin AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit)
      AND has_database_privilege(r.oid,current_database(),'CONNECT')
      AND NOT has_database_privilege(r.oid,current_database(),'CREATE')
      AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid AND deptype='o')) AS restricted_logins,
    (SELECT count(*)=2 FROM pg_class WHERE oid IN (to_regclass('public.user_roles'),to_regclass('public.role_assignment_audit'))
      AND relkind='r' AND relowner=current_user::regrole) AS relation_ownership,
    EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('public.role_assignment_audit')
      AND relrowsecurity AND NOT relforcerowsecurity) AS audit_rls,
    EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.user_roles')
      AND attname='role' AND atttypid=to_regtype('public.app_role') AND NOT attisdropped) AS role_type,
    EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('public.user_roles')
      AND NOT relrowsecurity) AS role_table_rls_baseline,
    coalesce(has_table_privilege(to_regclass('neon_auth."user"'),'SELECT'),false)
      AND coalesce(has_table_privilege(to_regclass('neon_auth."user"'),'UPDATE'),false)
      AND has_schema_privilege('neon_auth','USAGE')
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('neon_auth."user"')
        AND attname='id' AND atttypid='uuid'::regtype AND NOT attisdropped) AS auth_prerequisites`);
  if (!base || !Object.values(base).every((value) => value === true))
    throw new Error("migration prerequisites");
  const {
    rows: [acl],
  } = await db.query(
    `SELECT NOT EXISTS (
    SELECT 1 FROM pg_roles r CROSS JOIN pg_namespace n
    WHERE r.rolname IN ('skg_app','skg_role_writer','skg_audit_reader')
      AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND has_schema_privilege(r.oid,n.oid,'CREATE')) AS schema_create_denied,
    NOT EXISTS (SELECT 1 FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE r.rolname IN ('skg_role_writer','skg_audit_reader')
      AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND (
        (c.relkind IN ('r','p','v','m','f') AND
          (has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
           OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER')))
        OR (c.relkind='S' AND has_sequence_privilege(r.oid,c.oid,'USAGE,SELECT,UPDATE')))) AS services_table_denial,
    has_table_privilege('skg_app','public.user_roles','SELECT')
      AND NOT has_any_column_privilege('skg_app','public.role_assignment_audit','SELECT,INSERT,UPDATE,REFERENCES')
      AND NOT has_table_privilege('skg_app','public.role_assignment_audit','DELETE,TRUNCATE,TRIGGER')
      AND NOT has_any_column_privilege('skg_app','public.user_roles','INSERT,UPDATE,REFERENCES')
      AND NOT has_table_privilege('skg_app','public.user_roles','DELETE,TRUNCATE,TRIGGER') AS runtime_denial,
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN pg_roles r
      WHERE r.rolname IN ('skg_app','skg_role_writer','skg_audit_reader')
      AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND has_schema_privilege(r.oid,n.oid,'USAGE') AND has_function_privilege(r.oid,p.oid,'EXECUTE')
      AND NOT (r.rolname='skg_role_writer' AND p.oid IS NOT DISTINCT FROM to_regprocedure($1))
      AND NOT (r.rolname='skg_audit_reader' AND p.oid IS NOT DISTINCT FROM to_regprocedure($2))) AS unrelated_execute_denied`,
    [writer, reader],
  );
  if (!acl || !Object.values(acl).every((value) => value === true))
    throw new Error("effective service grants");
  const {
    rows: [objects],
  } = await db.query(`SELECT
    to_regnamespace('skg_private') IS NULL AS no_private_schema,
    NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.user_roles'::regclass AND attname='role_revision' AND NOT attisdropped) AS no_revision,
    to_regclass('public.role_audit_history_idx') IS NULL AS no_audit_index,
    NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_roles'::regclass
       AND conname='user_roles_role_revision_check') AS no_revision_constraint`);
  if (state === "pending") {
    if (!objects || !Object.values(objects).every((value) => value === true))
      throw new Error("unexpected existing migration objects");
    return state;
  }
  const {
    rows: [post],
  } = await db.query(
    `SELECT
    EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='skg_private' AND nspowner=current_user::regrole
      AND has_schema_privilege('skg_role_writer',oid,'USAGE') AND has_schema_privilege('skg_audit_reader',oid,'USAGE')
      AND NOT has_schema_privilege('skg_app',oid,'USAGE')) AS private_schema,
    EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid='public.user_roles'::regclass AND a.attname='role_revision' AND NOT a.attisdropped
      AND a.attnotnull AND a.atttypid='bigint'::regtype AND pg_get_expr(d.adbin,d.adrelid) IN ('0','0::bigint')) AS revision,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_roles'::regclass
      AND conname='user_roles_role_revision_check' AND contype='c' AND convalidated
      AND pg_get_constraintdef(oid)='CHECK ((role_revision >= 0))') AS revision_constraint,
    EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.role_audit_history_idx')
      AND indrelid='public.role_assignment_audit'::regclass AND indisready AND indisvalid
      AND pg_get_indexdef(indexrelid) LIKE '% USING btree (created_at DESC NULLS LAST, id DESC NULLS LAST)') AS audit_index,
    (SELECT count(*)=2 FROM pg_proc WHERE pronamespace=to_regnamespace('skg_private')) AS exact_function_count,
    (SELECT count(*)=2 FROM pg_proc p WHERE p.oid IN (to_regprocedure($1),to_regprocedure($2))
      AND p.proowner=current_user::regrole AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']
      AND ((p.oid=to_regprocedure($1) AND p.provolatile='v' AND p.prorettype='text'::regtype
            AND p.proconfig @> ARRAY['lock_timeout=3s'])
        OR (p.oid=to_regprocedure($2) AND p.provolatile='s' AND p.proretset))
      AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee <> p.proowner AND (a.grantee <> CASE WHEN p.oid=to_regprocedure($1)
          THEN 'skg_role_writer'::regrole ELSE 'skg_audit_reader'::regrole END OR a.is_grantable))) AS function_acl,
    has_function_privilege('skg_role_writer',to_regprocedure($1),'EXECUTE')
      AND has_function_privilege('skg_audit_reader',to_regprocedure($2),'EXECUTE')
      AND NOT has_function_privilege('skg_app',to_regprocedure($1),'EXECUTE')
      AND NOT has_function_privilege('skg_app',to_regprocedure($2),'EXECUTE')
      AND NOT has_function_privilege('skg_role_writer',to_regprocedure($2),'EXECUTE')
      AND NOT has_function_privilege('skg_audit_reader',to_regprocedure($1),'EXECUTE') AS service_execute`,
    [writer, reader],
  );
  if (!post || !Object.values(post).every((value) => value === true))
    throw new Error("postflight objects and grants");
  return state;
}

export async function runProductionPlan(
  db: Connection,
  mode: Mode,
  target: { database: string; role: string },
  plan: Plan,
  migrate: () => Promise<void>,
) {
  await db.query(
    mode === "apply"
      ? "BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE"
      : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
  );
  try {
    await db.query(
      "SET LOCAL search_path = pg_catalog, pg_temp; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='15s'",
    );
    if (mode === "apply") {
      // Verify before taking locks and re-inspect with the ledger serialized.
      if ((await inspect(db, target, plan)) !== "pending")
        throw new Error("apply requires exactly 0007");
      await db.query(
        "LOCK TABLE drizzle.__drizzle_migrations IN ACCESS EXCLUSIVE MODE",
      );
    }
    const state = await inspect(db, target, plan);
    if (mode === "preflight") {
      await db.query("ROLLBACK");
      return state;
    }
    if (state !== "pending") throw new Error("ledger changed before apply");
    await migrate();
    if ((await inspect(db, target, plan)) !== "applied")
      throw new Error("unregistered migrations");
    await db.query("COMMIT");
    return "applied";
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
