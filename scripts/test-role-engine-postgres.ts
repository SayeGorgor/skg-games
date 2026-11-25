import { deepStrictEqual, strictEqual } from "node:assert";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Client, neonConfig } from "@neondatabase/serverless";
import { approvedDbTarget } from "./lib/db-target";
import {
  roleChangeSql,
  verifyRoleWriter,
} from "./lib/role-writer-verification";
import { verifyRuntime } from "./lib/runtime-verification";

const slots = [
  "owner",
  "protectedOwner",
  "admin",
  "analyst",
  "player",
  "target",
  "implicit",
] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Fixture = Record<(typeof slots)[number], { id: string; email: string }>;
type Input = [
  actor: string,
  target: string,
  requested: string,
  previous: string | null,
  revision: string | null,
];
type RoleRow = { user_id: string; role: string; revision: string };

let stage = "opt-in and target configuration";

function configuration() {
  const env = process.env;
  strictEqual(env.SKG_ROLE_INTEGRATION_ENABLED, "yes");
  const owner = approvedDbTarget(env, "MIGRATION");
  const app = approvedDbTarget(env, "VERIFY");
  const writer = approvedDbTarget(env, "ROLE_WRITER_VERIFY");
  strictEqual(owner.role, "neondb_owner");
  for (const target of [app, writer]) {
    strictEqual(target.host, owner.host);
    strictEqual(target.database, owner.database);
  }
  const project = env.SKG_ROLE_INTEGRATION_PROJECT_ID ?? "";
  const branch = env.SKG_ROLE_INTEGRATION_BRANCH_ID ?? "";
  const endpoint = env.SKG_ROLE_INTEGRATION_ENDPOINT_ID ?? "";
  const nonce = env.SKG_ROLE_INTEGRATION_NONCE ?? "";
  strictEqual(/^[-a-z0-9]+$/.test(project), true);
  strictEqual(/^br-[a-z0-9-]+$/.test(branch), true);
  strictEqual(/^ep-[a-z0-9-]+$/.test(endpoint), true);
  strictEqual(
    new RegExp(`^${endpoint}\\.[a-z0-9.-]+\\.neon\\.tech$`).test(owner.host),
    true,
  );
  strictEqual(uuid.test(nonce), true);
  const fixture = JSON.parse(
    env.SKG_ROLE_INTEGRATION_FIXTURES ?? "",
  ) as Fixture;
  deepStrictEqual(Object.keys(fixture).sort(), [...slots].sort());
  for (const slot of slots) {
    strictEqual(uuid.test(fixture[slot]?.id), true);
    const [local, domain, extra] = fixture[slot].email.split("@");
    strictEqual(local, `skg-${slot.toLowerCase()}-${nonce}`);
    strictEqual(/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain), true);
    strictEqual(extra, undefined);
  }
  const ids = slots.map((slot) => fixture[slot].id);
  strictEqual(new Set(ids).size, slots.length);
  // Refuse common deployed/runtime destinations even if someone reused their credentials.
  for (const name of ["DATABASE_URL", "SKG_RBAC_WRITER_DATABASE_URL"]) {
    const value = env[name];
    if (value)
      strictEqual(
        new URL(value).hostname.split(".")[0].replace(/-pooler$/, "") ===
          endpoint,
        false,
      );
  }
  return { owner, app, writer, project, branch, endpoint, nonce, fixture, ids };
}

async function assign(db: Client, input: Input) {
  return (await db.query(roleChangeSql, input)).rows[0]?.status;
}

async function denied(db: Client, sql: string, params?: unknown[]) {
  await db.query("BEGIN");
  try {
    let code: string | undefined;
    try {
      await db.query(sql, params);
    } catch (error) {
      code = (error as { code?: string }).code;
    }
    strictEqual(code, "42501");
  } finally {
    await db.query("ROLLBACK");
  }
}

async function blocking(observer: Client, holder: number, waiter: number) {
  const deadline = performance.now() + 1800;
  while (performance.now() < deadline) {
    const {
      rows: [row],
    } = await observer.query(
      "SELECT $1::int = ANY(pg_blocking_pids($2::int)) AS blocked",
      [holder, waiter],
    );
    if (row.blocked === true) return;
    await delay(25);
  }
  throw new Error("Expected PostgreSQL lock wait");
}

async function main() {
  const config = configuration();
  const { ids, fixture } = config;
  const { owner, protectedOwner, admin, analyst, player, target, implicit } =
    Object.fromEntries(slots.map((slot) => [slot, fixture[slot].id])) as Record<
      (typeof slots)[number],
      string
    >;
  const clients: Client[] = [];
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  async function connect(connection: typeof config.owner) {
    const db = new Client({
      connectionString: connection.url,
      connectionTimeoutMillis: 10000,
      query_timeout: 12000,
    });
    clients.push(db);
    db.on("error", () => {});
    await db.connect();
    await db.query(
      "SET statement_timeout='8s'; SET lock_timeout='2s'; SET idle_in_transaction_session_timeout='15s'",
    );
    const {
      rows: [identity],
    } = await db.query(
      "SELECT current_database() AS db, current_user AS role, session_user AS session, pg_backend_pid() AS pid",
    );
    deepStrictEqual(identity, {
      db: connection.database,
      role: connection.role,
      session: connection.role,
      pid: identity.pid,
    });
    return { db, pid: identity.pid as number };
  }

  try {
    stage = "database identity and isolated branch marker";
    const { db: observer } = await connect(config.owner);
    const { rows: markers } = await observer.query(
      "SELECT project_id, branch_id, endpoint_id, nonce::text FROM skg_role_integration.target",
    );
    deepStrictEqual(markers, [
      {
        project_id: config.project,
        branch_id: config.branch,
        endpoint_id: config.endpoint,
        nonce: config.nonce,
      },
    ]);
    const {
      rows: [lock],
    } = await observer.query(
      "SELECT pg_try_advisory_lock(1936418663, 1919050084) AS acquired",
    );
    strictEqual(lock.acquired, true);

    async function snapshot() {
      const {
        rows: [state],
      } = await observer.query<{
        roles: RoleRow[];
        audits: Record<string, unknown>[];
      }>(
        `SELECT
         coalesce((SELECT jsonb_agg((to_jsonb(r) - 'role_revision') || jsonb_build_object('revision', r.role_revision::text) ORDER BY r.user_id)
                   FROM public.user_roles r), '[]') AS roles,
         coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)
                   FROM public.role_assignment_audit a), '[]') AS audits`,
      );
      return state;
    }

    stage = "synthetic Auth identities and unused fixtures";
    const { rows: accounts } = await observer.query(
      'SELECT id::text, email FROM neon_auth."user" WHERE id=ANY($1::uuid[])',
      [ids],
    );
    deepStrictEqual(
      accounts.sort((a, b) => a.id.localeCompare(b.id)),
      slots
        .map((slot) => fixture[slot])
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
    const {
      rows: [existing],
    } = await observer.query(
      "SELECT EXISTS (SELECT 1 FROM public.user_roles) OR EXISTS (SELECT 1 FROM public.role_assignment_audit) AS populated",
    );
    strictEqual(existing.populated, false);

    stage = "live privilege boundaries";
    const { db: app } = await connect(config.app);
    const { db: writer, pid: writerPid } = await connect(config.writer);
    const { db: competitor, pid: competitorPid } = await connect(config.writer);
    for (const result of [
      ...(await verifyRuntime(app, config.app.database)),
      ...(await verifyRoleWriter(writer, config.writer.database)),
    ]) {
      console.log(
        `${result.passed ? "PASS" : "FAIL"} privilege ${result.check}`,
      );
      if (!result.passed) process.exitCode = 1;
    }
    strictEqual(process.exitCode, undefined);
    // Even if a grant has drifted, this call uses invalid IDs and runs inside a rollback.
    await denied(app, roleChangeSql, [
      "invalid",
      "invalid",
      "player",
      null,
      null,
    ]);
    console.log("PASS runtime function execution denied");

    stage = "seed fresh synthetic assignments";
    await observer.query(
      `INSERT INTO public.user_roles(user_id,role)
       SELECT * FROM unnest($1::text[], $2::public.app_role[])`,
      [
        [owner, protectedOwner, admin, analyst, player, target],
        ["owner", "owner", "admin", "analyst", "player", "player"],
      ],
    );

    function changed(
      before: Awaited<ReturnType<typeof snapshot>>,
      after: Awaited<ReturnType<typeof snapshot>>,
      input: Input,
    ) {
      const [actor, id, role, previous, revision] = input;
      const old = before.roles.find((row) => row.user_id === id);
      strictEqual(old?.role ?? null, previous);
      strictEqual(old?.revision ?? null, revision);
      const actual = after.roles.find((row) => row.user_id === id);
      strictEqual(actual?.role, role);
      strictEqual(actual?.revision, String(BigInt(revision ?? "0") + 1n));
      deepStrictEqual(
        after.roles.filter((row) => row.user_id !== id),
        before.roles.filter((row) => row.user_id !== id),
      );
      const extra = after.audits.filter(
        (row) => !before.audits.some((old) => old.id === row.id),
      );
      strictEqual(extra.length, 1);
      const [{ id: auditId, created_at: timestamp, ...audit }] = extra;
      strictEqual(uuid.test(String(auditId)), true);
      strictEqual(Number.isFinite(Date.parse(String(timestamp))), true);
      deepStrictEqual(audit, {
        actor_type: "authenticated_admin",
        actor_user_id: actor,
        target_user_id: id,
        previous_role: previous,
        new_role: role,
        action: "role_assignment",
        operator_reference: null,
      });
      deepStrictEqual(
        after.audits.filter((row) => row.id !== auditId),
        before.audits,
      );
    }

    async function check(label: string, input: Input, expected: string) {
      stage = label;
      const before = await snapshot();
      strictEqual(await assign(writer, input), expected);
      const after = await snapshot();
      if (expected === "success") changed(before, after, input);
      else deepStrictEqual(after, before);
      console.log(`PASS ${label}`);
    }

    let previous = "player";
    let revision = 0;
    for (const [actor, label, path] of [
      [
        owner,
        "Owner",
        ["analyst", "player", "admin", "analyst", "admin", "player"],
      ],
      [admin, "Admin", ["analyst", "player"]],
    ] as const) {
      for (const next of path) {
        await check(
          `${label} ${previous} to ${next}`,
          [actor, target, next, previous, String(revision)],
          "success",
        );
        previous = next;
        revision++;
      }
    }
    const missing = randomUUID();
    for (const [label, input, expected] of [
      [
        "Admin assigning Admin",
        [admin, target, "admin", "player", "8"],
        "forbidden",
      ],
      [
        "Admin assigning Owner",
        [admin, target, "owner", "player", "8"],
        "forbidden",
      ],
      [
        "Admin modifying Owner",
        [admin, protectedOwner, "player", "owner", "0"],
        "forbidden",
      ],
      [
        "Owner modifying Owner",
        [owner, protectedOwner, "admin", "owner", "0"],
        "forbidden",
      ],
      [
        "Owner assigning Owner",
        [owner, target, "owner", "player", "8"],
        "forbidden",
      ],
      ["Owner self change", [owner, owner, "admin", "owner", "0"], "forbidden"],
      [
        "Admin self change",
        [admin, admin, "player", "admin", "0"],
        "forbidden",
      ],
      [
        "Analyst actor",
        [analyst, target, "analyst", "player", "8"],
        "forbidden",
      ],
      ["Player actor", [player, target, "analyst", "player", "8"], "forbidden"],
      [
        "Malformed target",
        [owner, "invalid", "analyst", null, null],
        "forbidden",
      ],
      [
        "Nonexistent Auth target",
        [owner, missing, "analyst", null, null],
        "not_found",
      ],
      [
        "Invalid requested role",
        [owner, target, "invalid", "player", "8"],
        "forbidden",
      ],
      [
        "Invalid expected role",
        [owner, target, "analyst", "invalid", "8"],
        "forbidden",
      ],
      ["Stale role", [owner, target, "analyst", "analyst", "8"], "stale_state"],
      [
        "Stale revision after role cycles",
        [owner, target, "analyst", "player", "0"],
        "stale_state",
      ],
      [
        "Explicit role no-op",
        [owner, target, "player", "player", "8"],
        "no_change",
      ],
      [
        "Implicit player no-op",
        [owner, implicit, "player", null, null],
        "no_change",
      ],
    ] satisfies [string, Input, string][]) {
      await check(label, input, expected);
    }

    async function race(
      label: string,
      first: Input,
      second: Input,
      expected: string,
    ) {
      stage = label;
      const before = await snapshot();
      await writer.query("BEGIN");
      let waiting:
        Promise<{ status: unknown } | { error: unknown }> | undefined;
      try {
        strictEqual(await assign(writer, first), "success");
        waiting = assign(competitor, second).then(
          (status) => ({ status }),
          (error) => ({ error }),
        );
        await blocking(observer, writerPid, competitorPid);
        deepStrictEqual(await snapshot(), before);
        await writer.query("COMMIT");
      } catch (error) {
        // A failed COMMIT can be ambiguous. End the run without replaying either request.
        await writer.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        await waiting;
      }
      deepStrictEqual(await waiting, { status: expected });
      changed(before, await snapshot(), first);
      console.log(`PASS ${label}`);
    }
    await race(
      "competing same-target writes",
      [owner, target, "admin", "player", "8"],
      [owner, target, "analyst", "player", "8"],
      "stale_state",
    );
    await check(
      "Admin modifying Admin",
      [admin, target, "player", "admin", "9"],
      "forbidden",
    );
    await race(
      "competing inserts into an absent assignment",
      [owner, implicit, "analyst", null, null],
      [owner, implicit, "admin", null, null],
      "stale_state",
    );
    await check(
      "replayed absent-row assignment",
      [owner, implicit, "analyst", null, null],
      "stale_state",
    );
    await race(
      "queued request by concurrently demoted Admin",
      [owner, admin, "player", "admin", "0"],
      [admin, implicit, "player", "analyst", "1"],
      "forbidden",
    );

    stage = "audit failure rolls back the role write";
    const before = await snapshot();
    await observer.query("BEGIN");
    try {
      // The validated UUID is the only interpolation. The DDL and any writes roll back together.
      await observer.query(`ALTER TABLE public.role_assignment_audit
        ADD CONSTRAINT skg_fixture_audit_rejection CHECK (target_user_id <> '${implicit}') NOT VALID`);
      await observer.query("SAVEPOINT audit_failure");
      let failure: { code?: string; constraint?: string } | undefined;
      try {
        await assign(observer, [owner, implicit, "player", "analyst", "1"]);
      } catch (error) {
        failure = error as typeof failure;
      }
      strictEqual(failure?.code, "23514");
      strictEqual(failure?.constraint, "skg_fixture_audit_rejection");
      await observer.query("ROLLBACK TO SAVEPOINT audit_failure");
      deepStrictEqual(await snapshot(), before);
    } finally {
      await observer.query("ROLLBACK");
    }
    deepStrictEqual(await snapshot(), before);
    console.log("PASS audit failure rolls back the role write");
    console.log("SKIP managed Auth target deletion during a request");
  } finally {
    await Promise.allSettled(clients.map((db) => db.end()));
  }
}

void main().catch(() => {
  console.error(
    `FAIL ${stage}. Raw diagnostics suppressed. Use fresh synthetic fixtures after any write attempt.`,
  );
  process.exitCode = 1;
});
