import { expect, it } from "vitest";
import { bootstrapOwner, type BootstrapSql } from "./owner-bootstrap";
import {
  bootstrapConfirmation,
  parseBootstrapOptions,
} from "./owner-bootstrap-options";

// Protocol-level transaction double for the PostgreSQL advisory lock unsupported
// by PGlite. Each session has independent staged writes. Reads see shared committed
// state only after obtaining the real production lock statement. No lock is
// removed or weakened in production for this test.
function database() {
  const state = { owner: null as string | null, audits: 0 };
  let tail = Promise.resolve();
  const sessions: string[][] = [];
  function client(failAudit = false): BootstrapSql {
    const queries: string[] = [];
    sessions.push(queries);
    let release: (() => void) | undefined;
    let stagedOwner: string | null = null;
    let stagedAudit = false;
    let begun = false;
    const rows = (value: Record<string, unknown>[]) => ({ rows: value });
    const held = () => {
      if (!begun || !release)
        throw new Error("write/check occurred outside locked transaction");
    };
    return {
      async query(text, values) {
        queries.push(text);
        if (text.startsWith("BEGIN")) {
          begun = true;
          return rows([]);
        }
        if (text.startsWith("SET LOCAL")) return rows([]);
        if (text === "SELECT pg_advisory_xact_lock($1, $2)") {
          expect(values).toEqual([1397442375, 1]);
          const previous = tail;
          let unlock!: () => void;
          tail = new Promise<void>((resolve) => {
            unlock = resolve;
          });
          await previous;
          release = unlock;
          return rows([{}]);
        }
        held();
        if (text.startsWith("SELECT table_schema")) {
          const columns = {
            user_roles: {
              user_id: "text",
              role: "app_role",
              updated_at: "timestamptz",
            },
            role_assignment_audit: {
              id: "uuid",
              actor_type: "text",
              actor_user_id: "text",
              operator_reference: "text",
              target_user_id: "text",
              previous_role: "app_role",
              new_role: "app_role",
              action: "text",
              created_at: "timestamptz",
            },
            user: { id: "uuid" },
          };
          return rows(
            Object.entries(columns).flatMap(([table, fields]) =>
              Object.entries(fields).map(([column, type]) => ({
                table_schema: table === "user" ? "neon_auth" : "public",
                table_name: table,
                column_name: column,
                udt_name: type,
                udt_schema: type === "app_role" ? "public" : "pg_catalog",
              })),
            ),
          );
        }
        if (text.includes("EXISTS (SELECT 1 FROM pg_indexes"))
          return rows([
            {
              bootstrap_guard: true,
              audit_rls: true,
              audit_visible: true,
              roles: ["owner", "admin", "analyst", "player"],
            },
          ]);
        if (text.startsWith("LOCK TABLE")) return rows([]);
        if (text.startsWith("SELECT current_database()"))
          return rows([{ database: "postgres", database_role: "operator" }]);
        if (text.startsWith("SELECT id::text AS id FROM neon_auth."))
          return rows([{ id: values![0] }]);
        if (text.includes("count(*)::text AS count FROM public.user_roles"))
          return rows([{ count: state.owner ? "1" : "0" }]);
        if (
          text.includes(
            "count(*)::text AS count FROM public.role_assignment_audit",
          )
        )
          return rows([{ count: String(state.audits) }]);
        if (text.startsWith("SELECT role::text")) return rows([]);
        if (text.startsWith("INSERT INTO public.user_roles")) {
          stagedOwner = values![0] as string;
          return rows([{ user_id: stagedOwner }]);
        }
        if (text.startsWith("INSERT INTO public.role_assignment_audit")) {
          if (failAudit) throw new Error("synthetic audit failure");
          expect(values![1]).toBe(stagedOwner);
          stagedAudit = true;
          return rows([{ id: "synthetic-audit-id" }]);
        }
        if (text === "COMMIT") {
          expect(stagedOwner).not.toBeNull();
          expect(stagedAudit).toBe(true);
          state.owner = stagedOwner;
          state.audits++;
          release!();
          release = undefined;
          return rows([]);
        }
        if (text === "ROLLBACK") {
          stagedOwner = null;
          stagedAudit = false;
          release!();
          release = undefined;
          return rows([]);
        }
        throw new Error("unhandled test query");
      },
    };
  }
  return { state, client, sessions };
}
function options(id: string) {
  const option = parseBootstrapOptions([
    "--execute",
    "--user-id",
    id,
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
  ]);
  return { ...option, confirmation: bootstrapConfirmation(option) };
}
const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
it("serializes concurrent attempts so only one Owner/audit can commit", async () => {
  const db = database();
  const outcomes = await Promise.allSettled([
    bootstrapOwner(db.client(), options(first)),
    bootstrapOwner(db.client(), options(second)),
  ]);
  expect(
    outcomes.filter((outcome) => outcome.status === "fulfilled"),
  ).toHaveLength(1);
  expect(
    outcomes.filter((outcome) => outcome.status === "rejected"),
  ).toHaveLength(1);
  expect(db.state).toEqual({ owner: first, audits: 1 });
  expect(db.sessions[1].at(-1)).toBe("ROLLBACK");
  expect(db.sessions[1].some((query) => query.startsWith("INSERT"))).toBe(
    false,
  );
});
it("releases the transaction lock after rollback so a waiting attempt can safely succeed", async () => {
  const db = database();
  const outcomes = await Promise.allSettled([
    bootstrapOwner(db.client(true), options(first)),
    bootstrapOwner(db.client(), options(second)),
  ]);
  expect(outcomes[0].status).toBe("rejected");
  expect(outcomes[1].status).toBe("fulfilled");
  expect(db.state).toEqual({ owner: second, audits: 1 });
});
