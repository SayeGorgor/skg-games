// CLI-only implementation. Never import from application/request-handling code.
import {
  OwnerBootstrapError,
  fingerprint,
  verifyExecutionApproval,
  type BootstrapOptions,
} from "./owner-bootstrap-options";
export type BootstrapSql = {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
};
export type Preflight = {
  database: string;
  databaseRoleFingerprint: string;
  previousRole: "player" | null;
};

async function verifySchema(db: BootstrapSql): Promise<void> {
  const { rows } =
    await db.query(`SELECT table_schema, table_name, column_name, data_type, udt_schema, udt_name
    FROM information_schema.columns
    WHERE (table_schema='public' AND table_name IN ('user_roles','role_assignment_audit'))
      OR (table_schema='neon_auth' AND table_name='user' AND column_name='id')`);
  const required = [
    ["public", "user_roles", "user_id", "text"],
    ["public", "user_roles", "role", "app_role"],
    ["public", "user_roles", "updated_at", "timestamptz"],
    ["public", "role_assignment_audit", "id", "uuid"],
    ["public", "role_assignment_audit", "actor_type", "text"],
    ["public", "role_assignment_audit", "actor_user_id", "text"],
    ["public", "role_assignment_audit", "operator_reference", "text"],
    ["public", "role_assignment_audit", "target_user_id", "text"],
    ["public", "role_assignment_audit", "previous_role", "app_role"],
    ["public", "role_assignment_audit", "new_role", "app_role"],
    ["public", "role_assignment_audit", "action", "text"],
    ["public", "role_assignment_audit", "created_at", "timestamptz"],
    ["neon_auth", "user", "id", "uuid"],
  ];
  if (
    !required.every(([schema, table, column, type]) =>
      rows.some(
        (row) =>
          row.table_schema === schema &&
          row.table_name === table &&
          row.column_name === column &&
          row.udt_name === type &&
          row.udt_schema === (type === "app_role" ? "public" : "pg_catalog"),
      ),
    )
  )
    throw new OwnerBootstrapError("schema");
  const state = (
    await db.query(`SELECT
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='role_assignment_audit'
      AND indexname='role_audit_initial_owner_uq' AND indexdef LIKE 'CREATE UNIQUE INDEX%') AS bootstrap_guard,
    (SELECT relrowsecurity FROM pg_class WHERE oid='public.role_assignment_audit'::regclass) AS audit_rls,
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles r ON r.rolname=current_user
      WHERE c.oid='public.role_assignment_audit'::regclass
        AND (r.rolsuper OR r.rolbypassrls OR (r.oid=c.relowner AND NOT c.relforcerowsecurity))) AS audit_visible,
    (SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum
      WHERE enumtypid='public.app_role'::regtype) AS roles`)
  ).rows[0];
  if (
    !state?.bootstrap_guard ||
    !state.audit_rls ||
    !state.audit_visible ||
    JSON.stringify(state.roles) !==
      JSON.stringify(["owner", "admin", "analyst", "player"])
  )
    throw new OwnerBootstrapError("schema");
}
async function inspect(
  db: BootstrapSql,
  options: BootstrapOptions,
  lockTarget: boolean,
): Promise<Preflight> {
  const identity = (
    await db.query(
      "SELECT current_database() AS database, current_user AS database_role",
    )
  ).rows[0];
  if (
    identity?.database !== options.expectedDatabase ||
    typeof identity.database_role !== "string"
  )
    throw new OwnerBootstrapError("target");
  await verifySchema(db);
  // Do not read emails, profiles, sessions or account details.
  const target = await db.query(
    lockTarget
      ? 'SELECT id::text AS id FROM neon_auth."user" WHERE id=$1::uuid FOR KEY SHARE'
      : 'SELECT id::text AS id FROM neon_auth."user" WHERE id=$1::uuid',
    [options.userId],
  );
  if (target.rows.length !== 1 || target.rows[0].id !== options.userId)
    throw new OwnerBootstrapError("auth_user");
  const owners = (
    await db.query(
      "SELECT count(*)::text AS count FROM public.user_roles WHERE role='owner'",
    )
  ).rows[0];
  if (Number(owners?.count) !== 0)
    throw new OwnerBootstrapError("owner_exists");
  const audit = (
    await db.query(
      "SELECT count(*)::text AS count FROM public.role_assignment_audit WHERE action='owner_bootstrap'",
    )
  ).rows[0];
  if (Number(audit?.count) !== 0)
    throw new OwnerBootstrapError("bootstrap_used");
  const role = await db.query(
    "SELECT role::text AS role FROM public.user_roles WHERE user_id=$1",
    [options.userId],
  );
  if (
    role.rows.length > 1 ||
    (role.rows.length && role.rows[0].role !== "player")
  )
    throw new OwnerBootstrapError("privileged_target");
  return {
    database: identity.database,
    databaseRoleFingerprint: fingerprint(identity.database_role).slice(0, 12),
    previousRole: role.rows.length ? "player" : null,
  };
}

/** Dry-run uses a read-only snapshot. Execution rechecks everything after locks;
 * READ COMMITTED is deliberate so a waiter sees the preceding committed Owner.
 * The same dedicated client must be used for every statement until COMMIT.
 */
export async function bootstrapOwner(
  db: BootstrapSql,
  options: BootstrapOptions,
): Promise<Preflight> {
  verifyExecutionApproval(options);
  let begun = false;
  try {
    await db.query(
      options.execute
        ? "BEGIN ISOLATION LEVEL READ COMMITTED"
        : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    begun = true;
    await db.query("SET LOCAL statement_timeout = '15s'");
    await db.query("SET LOCAL lock_timeout = '10s'");
    if (options.execute) {
      await db.query("SELECT pg_advisory_xact_lock($1, $2)", [1397442375, 1]);
      await verifySchema(db);
      // Also block non-cooperating INSERT/UPDATE/DELETE writers during the check
      // and commit. Phase 3 must use the same lock protocol for role mutations.
      await db.query(
        "LOCK TABLE public.user_roles, public.role_assignment_audit IN SHARE ROW EXCLUSIVE MODE",
      );
    }
    const preflight = await inspect(db, options, options.execute);
    if (options.execute) {
      const assigned = await db.query(
        `INSERT INTO public.user_roles(user_id,role) VALUES ($1,'owner')
        ON CONFLICT (user_id) DO UPDATE SET role='owner',updated_at=now()
        WHERE user_roles.role='player' RETURNING user_id`,
        [options.userId],
      );
      if (
        assigned.rows.length !== 1 ||
        assigned.rows[0].user_id !== options.userId
      )
        throw new OwnerBootstrapError("privileged_target");
      const audit = await db.query(
        `INSERT INTO public.role_assignment_audit
        (actor_type,actor_user_id,operator_reference,target_user_id,previous_role,new_role,action)
        VALUES ('system_bootstrap',NULL,$1,$2,$3,'owner','owner_bootstrap') RETURNING id`,
        [options.operatorReference, options.userId, preflight.previousRole],
      );
      if (audit.rows.length !== 1) throw new OwnerBootstrapError("database");
    }
    await db.query("COMMIT");
    begun = false;
    return preflight;
  } catch (error) {
    if (begun) {
      try {
        await db.query("ROLLBACK");
      } catch {
        /* Connection will be closed; never report success. */
      }
    }
    if (error instanceof OwnerBootstrapError) throw error;
    throw new OwnerBootstrapError("database");
  }
}
