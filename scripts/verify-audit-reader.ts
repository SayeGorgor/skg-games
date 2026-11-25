import { deepStrictEqual, strictEqual } from "node:assert";
import { Client, neonConfig } from "@neondatabase/serverless";
import { approvedDbTarget } from "./lib/db-target";
import {
  readAuditSql,
  verifyAuditReader,
} from "./lib/audit-reader-verification";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let stage = "approved isolated reader target";

async function main() {
  const target = approvedDbTarget(process.env, "AUDIT_READER_VERIFY");
  const integration = process.argv.includes("--integration");
  const args = integration ? ["--integration"] : [];
  deepStrictEqual(process.argv.slice(2), args);
  let fixture: { target: string; ids: string[] } | undefined;
  if (integration) {
    stage = "explicit synthetic fixture inventory";
    strictEqual(process.env.SKG_AUDIT_READER_VERIFY_INTEGRATION, "yes");
    fixture = JSON.parse(process.env.SKG_AUDIT_READER_VERIFY_FIXTURE ?? "");
    strictEqual(
      typeof fixture?.target === "string" && uuid.test(fixture.target),
      true,
    );
    strictEqual(
      Array.isArray(fixture?.ids) &&
        fixture.ids.length === 3 &&
        new Set(fixture.ids).size === 3 &&
        fixture.ids.every((id) => typeof id === "string" && uuid.test(id)),
      true,
    );
  }

  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const db = new Client({
    connectionString: target.url,
    connectionTimeoutMillis: 10000,
    query_timeout: 8000,
  });
  db.on("error", () => {});
  try {
    stage = "connection and privilege verification";
    await db.connect();
    const checks = await verifyAuditReader(db, target.database);
    for (const { check, passed } of checks)
      console.log(`${passed ? "PASS" : "FAIL"} ${check}`);
    strictEqual(
      checks.every(({ passed }) => passed),
      true,
    );
    stage = "read-only SECURITY DEFINER call";
    await db.query("BEGIN READ ONLY");
    try {
      const defaultArgs = [
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        1,
      ];
      const { rows } = await db.query(readAuditSql, defaultArgs);
      strictEqual(rows.length <= 1, true);
      console.log("PASS bounded read-only function execution");
      if (fixture) {
        stage = "synthetic history, filters and keyset boundary";
        const firstParams = [
          "role_assignment",
          null,
          fixture.target,
          null,
          null,
          null,
          null,
          null,
          null,
          2,
        ];
        const first = (
          await db.query(
            `SELECT rows.*,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM (${readAuditSql}) rows ORDER BY created_at DESC,id DESC`,
            firstParams,
          )
        ).rows;
        deepStrictEqual(
          first.map((row) => row.id),
          fixture.ids.slice(0, 2),
        );
        strictEqual(first[0].previous_role, null);
        strictEqual(first[1].previous_role, "player");
        const second = (
          await db.query(readAuditSql, [
            ...firstParams.slice(0, 7),
            first[1].cursor_time,
            first[1].id,
            2,
          ])
        ).rows;
        deepStrictEqual(
          second.map((row) => row.id),
          fixture.ids.slice(2),
        );
        const filtered = (
          await db.query(readAuditSql, [
            "role_assignment",
            first[0].actor_user_id,
            fixture.target,
            null,
            null,
            "implicit",
            first[0].new_role,
            null,
            null,
            26,
          ])
        ).rows;
        deepStrictEqual(
          filtered.map((row) => row.id),
          fixture.ids.slice(0, 1),
        );
        console.log(
          "PASS synthetic null/Player history, filter and keyset boundary",
        );
      }
    } finally {
      await db.query("ROLLBACK");
    }
  } finally {
    await db.end();
  }
}

void main().catch(() => {
  console.error(
    `FAIL ${stage}. Review the approved isolated target privately.`,
  );
  process.exitCode = 1;
});
