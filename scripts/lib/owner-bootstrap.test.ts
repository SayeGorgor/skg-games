import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { bootstrapOwner, type BootstrapSql } from "./owner-bootstrap";
import {
  parseBootstrapOptions,
  bootstrapConfirmation,
  safeBootstrapError,
} from "./owner-bootstrap-options";
import { runOwnerBootstrapCli } from "./owner-bootstrap-cli";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth/viewer", () => ({ getViewer: vi.fn() }));
import { drizzle } from "drizzle-orm/pglite";
import { getDb } from "@/lib/db";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import {
  getCurrentUserRole,
  requirePermission,
} from "@/lib/auth/authorization";
import { appPermissions } from "@/lib/auth/permissions";
import { requireAnalyticsAdmin } from "@/lib/analytics/access";
const pg = new PGlite();
const target = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const args = [
  "--user-id",
  target,
  "--environment",
  "development",
  "--project-id",
  "example-project",
  "--branch-id",
  "br-example",
  "--expected-host",
  "ep-example.us-east-2.aws.neon.tech",
  "--expected-database",
  "postgres",
  "--operator-reference",
  "ops-review-001",
  "--console-verified",
];
const dry = parseBootstrapOptions(args);
const execute = {
  ...dry,
  execute: true,
  confirmation: bootstrapConfirmation(dry),
};
let statements: string[];
const sql: BootstrapSql = {
  async query(text, values) {
    statements.push(text);
    // PGlite lacks transaction advisory locks. Keep the production SQL untouched;
    // concurrency/lock ordering is independently exercised by the transaction double.
    if (text === "SELECT pg_advisory_xact_lock($1, $2)") return { rows: [{}] };
    return pg.query<Record<string, unknown>>(text, values);
  },
};
beforeAll(async () => {
  for (const file of readdirSync("drizzle")
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort())
    await pg.exec(
      readFileSync(path.join("drizzle", file), "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
  // Synthetic managed Auth schema exists ONLY inside this in-memory test DB.
  await pg.exec(
    'CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user" (id uuid PRIMARY KEY)',
  );
}, 30000);
beforeEach(async () => {
  statements = [];
  await pg.exec(`DROP TRIGGER IF EXISTS fail_audit_test ON role_assignment_audit;
    DROP TRIGGER IF EXISTS fail_role_test ON user_roles;
    DELETE FROM role_assignment_audit; DELETE FROM user_roles; DELETE FROM neon_auth."user";
    INSERT INTO neon_auth."user"(id) VALUES ('${target}'),('${other}');`);
});
afterAll(async () => {
  await pg.close();
});
async function counts() {
  return (
    await pg.query(
      "SELECT (SELECT count(*)::int FROM user_roles WHERE role='owner') AS owners,(SELECT count(*)::int FROM role_assignment_audit) AS audits",
    )
  ).rows[0];
}
it("dry run uses a read-only transaction and never creates roles, profiles or audit rows", async () => {
  expect(await bootstrapOwner(sql, dry)).toMatchObject({
    database: "postgres",
    previousRole: null,
  });
  expect(statements[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  expect(
    statements.some((query) =>
      /^(INSERT|UPDATE|DELETE|LOCK|CREATE)/i.test(query),
    ),
  ).toBe(false);
  expect(await counts()).toEqual({ owners: 0, audits: 0 });
  expect((await pg.query("SELECT * FROM user_profiles")).rows).toEqual([]);
});
it("atomically creates exactly one Owner and one restricted audit record without requiring a profile", async () => {
  await pg.query("INSERT INTO user_roles(user_id,role) VALUES ($1,'analyst')", [
    other,
  ]);
  await bootstrapOwner(sql, execute);
  expect(await counts()).toEqual({ owners: 1, audits: 1 });
  expect(
    (
      await pg.query("SELECT role::text FROM user_roles WHERE user_id=$1", [
        other,
      ])
    ).rows,
  ).toEqual([{ role: "analyst" }]);
  const audit = (
    await pg.query<Record<string, unknown>>(
      "SELECT * FROM role_assignment_audit",
    )
  ).rows[0];
  expect(audit).toMatchObject({
    actor_type: "system_bootstrap",
    actor_user_id: null,
    operator_reference: "ops-review-001",
    target_user_id: target,
    previous_role: null,
    new_role: "owner",
    action: "owner_bootstrap",
  });
  expect(audit.id).toBeTruthy();
  expect(audit.created_at).toBeTruthy();
  const lock = statements.indexOf("SELECT pg_advisory_xact_lock($1, $2)");
  expect(lock).toBeGreaterThan(0);
  expect(
    statements.findIndex((query) =>
      query.startsWith("INSERT INTO public.user_roles"),
    ),
  ).toBeGreaterThan(lock);
  expect(statements.at(-1)).toBe("COMMIT");
});
it("records explicit previous Player accurately", async () => {
  await pg.query("INSERT INTO user_roles(user_id,role) VALUES ($1,'player')", [
    target,
  ]);
  await bootstrapOwner(sql, execute);
  expect(
    (await pg.query("SELECT previous_role::text FROM role_assignment_audit"))
      .rows,
  ).toEqual([{ previous_role: "player" }]);
});
it("refuses second bootstrap and refuses recovery even if the original Owner was demoted", async () => {
  await bootstrapOwner(sql, execute);
  await expect(bootstrapOwner(sql, dry)).rejects.toThrow(
    "Owner already exists",
  );
  await expect(bootstrapOwner(sql, execute)).rejects.toThrow(
    "Owner already exists",
  );
  await pg.query("UPDATE user_roles SET role='player' WHERE user_id=$1", [
    target,
  ]);
  await expect(bootstrapOwner(sql, execute)).rejects.toThrow(
    "audit already exists",
  );
  expect(await counts()).toEqual({ owners: 0, audits: 1 });
});
it.each(["admin", "analyst"])(
  "refuses existing privileged target %s without mutation",
  async (role) => {
    await pg.query("INSERT INTO user_roles(user_id,role) VALUES ($1,$2)", [
      target,
      role,
    ]);
    await expect(bootstrapOwner(sql, execute)).rejects.toThrow(
      "unexpected privileged",
    );
    expect(await counts()).toEqual({ owners: 0, audits: 0 });
  },
);
it("refuses missing Auth user and wrong actual database", async () => {
  await pg.query('DELETE FROM neon_auth."user" WHERE id=$1', [target]);
  await expect(bootstrapOwner(sql, dry)).rejects.toThrow("does not exist");
  await expect(
    bootstrapOwner(sql, { ...dry, expectedDatabase: "wrong" }),
  ).rejects.toThrow("target verification");
});
it("refuses missing migration and rolls back without partial changes", async () => {
  const db: BootstrapSql = {
    query: (text, values) =>
      text.startsWith("SELECT table_schema")
        ? Promise.resolve({ rows: [] })
        : sql.query(text, values),
  };
  await expect(bootstrapOwner(db, execute)).rejects.toThrow("schema");
  expect(statements.at(-1)).toBe("ROLLBACK");
  expect(await counts()).toEqual({ owners: 0, audits: 0 });
});
it.each(["audit", "role"])(
  "rolls back all assignment effects when %s insertion fails",
  async (failure) => {
    await pg.exec(`CREATE OR REPLACE FUNCTION fail_bootstrap_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'secret-password private@example.test'; END $$;
    CREATE TRIGGER fail_${failure}_test BEFORE INSERT ON ${failure === "audit" ? "role_assignment_audit" : "user_roles"} FOR EACH ROW EXECUTE FUNCTION fail_bootstrap_test();`);
    try {
      await bootstrapOwner(sql, execute);
      throw new Error("unexpected success");
    } catch (error) {
      expect(safeBootstrapError(error)).not.toMatch(
        /secret-password|private@example/,
      );
    }
    expect(await counts()).toEqual({ owners: 0, audits: 0 });
    expect(statements.at(-1)).toBe("ROLLBACK");
  },
);
it("rolls back if COMMIT fails before committing", async () => {
  const db: BootstrapSql = {
    query: (text, values) =>
      text === "COMMIT"
        ? Promise.reject(new Error("private failure"))
        : sql.query(text, values),
  };
  await expect(bootstrapOwner(db, execute)).rejects.toThrow(
    "no success is confirmed",
  );
  expect(await counts()).toEqual({ owners: 0, audits: 0 });
});
it("closes connections on CLI success and failure, with no ID/email/URL in output", async () => {
  const end = vi.fn(async () => {});
  const client = { ...sql, connect: async () => {}, end };
  const io = { out: vi.fn(), error: vi.fn() };
  const env = {
    SKG_RBAC_BOOTSTRAP_DATABASE_URL:
      "postgresql://operator:secret-password@ep-example.us-east-2.aws.neon.tech/postgres?sslmode=require",
  };
  expect(await runOwnerBootstrapCli(args, env, io, async () => client)).toBe(0);
  expect(end).toHaveBeenCalledOnce();
  expect(await counts()).toEqual({ owners: 0, audits: 0 });
  expect(
    await runOwnerBootstrapCli(
      [...args, "--execute", "--confirm", bootstrapConfirmation(dry)],
      env,
      io,
      async () => client,
    ),
  ).toBe(0);
  expect(end).toHaveBeenCalledTimes(2);
  expect(JSON.stringify([io.out.mock.calls, io.error.mock.calls])).not.toMatch(
    /secret-password|postgresql:|11111111|@/,
  );
});
it("enforces bounded operator references, bootstrap consistency and lifetime uniqueness in SQL", async () => {
  await expect(
    pg.query(
      `INSERT INTO role_assignment_audit(actor_type,operator_reference,target_user_id,new_role,action) VALUES ('system_bootstrap','email@example.test',$1,'owner','owner_bootstrap')`,
      [target],
    ),
  ).rejects.toThrow();
  await expect(
    pg.query(
      `INSERT INTO role_assignment_audit(actor_type,target_user_id,new_role,action) VALUES ('system_bootstrap',$1,'owner','owner_bootstrap')`,
      [target],
    ),
  ).rejects.toThrow();
  await bootstrapOwner(sql, execute);
  await expect(
    pg.query(
      `INSERT INTO role_assignment_audit(actor_type,operator_reference,target_user_id,new_role,action) VALUES ('system_bootstrap','ops-review-002',$1,'owner','owner_bootstrap')`,
      [other],
    ),
  ).rejects.toThrow();
});

it("rechecks the Auth user after a successful dry-run", async () => {
  await bootstrapOwner(sql, dry);
  await pg.query('DELETE FROM neon_auth."user" WHERE id=$1', [target]);
  await expect(bootstrapOwner(sql, execute)).rejects.toThrow("does not exist");
  expect(await counts()).toEqual({ owners: 0, audits: 0 });
});
it("RLS exposes no audit rows to an ordinary DB role even if someone grants SELECT", async () => {
  await bootstrapOwner(sql, execute);
  await pg.exec(
    "CREATE ROLE audit_test_reader NOLOGIN; GRANT SELECT ON role_assignment_audit TO audit_test_reader",
  );
  try {
    await pg.exec("SET ROLE audit_test_reader");
    expect(
      (await pg.query("SELECT * FROM role_assignment_audit")).rows,
    ).toEqual([]);
  } finally {
    await pg.exec("RESET ROLE");
  }
});

it("rejects a preflight that cannot see the complete protected audit history", async () => {
  const filtered: BootstrapSql = {
    async query(text, values) {
      const result = await sql.query(text, values);
      if (text.includes("EXISTS (SELECT 1 FROM pg_indexes"))
        result.rows[0].audit_visible = false;
      return result;
    },
  };
  await expect(bootstrapOwner(filtered, dry)).rejects.toThrow("schema");
  expect(await counts()).toEqual({ owners: 0, audits: 0 });
});
it("reports a safe closure failure after commit without retrying or undoing the atomic result", async () => {
  const io = { out: vi.fn(), error: vi.fn() };
  const client = {
    ...sql,
    connect: async () => {},
    end: vi.fn(async () => {
      throw new Error("postgresql://operator:secret@host private@example.test");
    }),
  };
  const code = await runOwnerBootstrapCli(
    [...args, "--execute", "--confirm", bootstrapConfirmation(dry)],
    {
      SKG_RBAC_BOOTSTRAP_DATABASE_URL:
        "postgresql://operator:secret-password@ep-example.us-east-2.aws.neon.tech/postgres?sslmode=require",
    },
    io,
    async () => client,
  );
  expect(code).toBe(1);
  expect(await counts()).toEqual({ owners: 1, audits: 1 });
  expect(
    statements.filter((query) =>
      query.startsWith("INSERT INTO public.user_roles"),
    ),
  ).toHaveLength(1);
  expect(client.end).toHaveBeenCalledOnce();
  expect(JSON.stringify(io.error.mock.calls)).not.toMatch(
    /postgresql:|private@example|secret/,
  );
});

it("resolves the bootstrapped Owner from DB and rejects Players despite stale configuration", async () => {
  vi.mocked(getDb).mockReturnValue(
    drizzle(pg) as unknown as NonNullable<ReturnType<typeof getDb>>,
  );
  vi.mocked(getViewer).mockResolvedValue({
    userId: target,
    authenticated: true,
    premium: false,
  } as Viewer);
  vi.stubEnv("SKG_ANALYTICS_ADMIN_USER_IDS", undefined);
  try {
    await bootstrapOwner(sql, execute);
    expect(await getCurrentUserRole()).toBe("owner");
    for (const permission of appPermissions)
      expect(await requirePermission(permission)).toBeUndefined();
    expect(await requireAnalyticsAdmin()).toBeUndefined();
    vi.mocked(getViewer).mockResolvedValue({
      userId: other,
      authenticated: true,
      premium: true,
    } as Viewer);
    expect(await getCurrentUserRole()).toBe("player");
    await expect(requireAnalyticsAdmin()).rejects.toThrow("NOT_FOUND");
    vi.stubEnv("SKG_ANALYTICS_ADMIN_USER_IDS", other);
    await expect(requireAnalyticsAdmin()).rejects.toThrow("NOT_FOUND");
    await expect(requirePermission("users:manage")).rejects.toThrow(
      "NOT_FOUND",
    );
    vi.mocked(getViewer).mockResolvedValue({
      userId: target,
      authenticated: true,
      premium: false,
    } as Viewer);
    await pg.query("UPDATE user_roles SET role='player' WHERE user_id=$1", [
      target,
    ]);
    expect(await getCurrentUserRole()).toBe("player");
    await expect(requirePermission("system:manage")).rejects.toThrow(
      "NOT_FOUND",
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
