import type { Client } from "@neondatabase/serverless";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterAll, beforeAll, expect, it } from "vitest";
import { applyDrizzlePlan } from "./production-drizzle-session";
import {
  ledgerState,
  productionTarget,
  runProductionPlan,
} from "./production-migration-runner";

const pglite = new PGlite();
const calls: string[] = [];
const db = {
  async query(
    input: string | { text: string; values?: unknown[]; rowMode?: "array" },
    params: unknown[] = [],
  ) {
    const text = typeof input === "string" ? input : input.text;
    calls.push(text);
    if (text.startsWith("SET LOCAL")) return (await pglite.exec(text))[0];
    return pglite.query<Record<string, unknown>>(
      text,
      typeof input === "string" ? params : (input.values ?? params),
      typeof input !== "string" && input.rowMode
        ? { rowMode: input.rowMode }
        : undefined,
    );
  },
};
const client = db as unknown as Client;
const plan = readMigrationFiles({ migrationsFolder: "drizzle" });
const target = { database: "postgres", role: "neondb_owner" };
const migration = () => applyDrizzlePlan(client, plan.slice(8));
beforeAll(async () => {
  await pglite.exec(`CREATE ROLE neondb_owner;
    CREATE ROLE skg_app LOGIN NOINHERIT;
    CREATE ROLE skg_role_writer LOGIN NOINHERIT;
    CREATE ROLE skg_audit_reader LOGIN NOINHERIT;
    GRANT CREATE ON SCHEMA public TO neondb_owner;
    GRANT CREATE ON DATABASE postgres TO neondb_owner;
    SET SESSION AUTHORIZATION neondb_owner;
    CREATE TYPE public.app_role AS ENUM ('owner','admin','analyst','player');
    CREATE TABLE public.user_roles(user_id text PRIMARY KEY,role public.app_role NOT NULL);
    GRANT SELECT ON public.user_roles TO skg_app;
    CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user"(id uuid PRIMARY KEY);
    BEGIN;`);
  // The earlier schema uses a minimal local fixture. Drizzle registers its fixture history.
  await applyDrizzlePlan(
    client,
    plan
      .slice(0, 8)
      .map((entry, i) => (i === 7 ? entry : { ...entry, sql: ["SELECT 1"] })),
  );
  await pglite.exec("COMMIT");
}, 20000);
afterAll(async () => {
  await pglite.close();
});

it("refuses contradictory credentials, malformed revision, pooled hosts and unapproved apply", () => {
  const valid = {
    NODE_ENV: "production" as const,
    SKG_PROD_MIGRATION_APPROVED_TARGET: "yes",
    SKG_PROD_MIGRATION_DATABASE_URL:
      "postgresql://neondb_owner:fixture@ep-example.c-1.us-east-2.aws.neon.tech/neondb?sslmode=require",
    SKG_PROD_MIGRATION_EXPECTED_HOST: "ep-example.c-1.us-east-2.aws.neon.tech",
    SKG_PROD_MIGRATION_EXPECTED_DATABASE: "neondb",
    SKG_PROD_MIGRATION_EXPECTED_ROLE: "neondb_owner",
    SKG_PROD_MIGRATION_REVIEWED_REVISION: "a".repeat(40),
  };
  expect(productionTarget(valid, ["--preflight"]).mode).toBe("preflight");
  expect(() => productionTarget(valid, ["--apply"])).toThrow();
  expect(() =>
    productionTarget({ ...valid, VERCEL_ENV: "preview" }, ["--preflight"]),
  ).toThrow();
  expect(() =>
    productionTarget(
      { ...valid, SKG_PROD_MIGRATION_REVIEWED_REVISION: "main" },
      ["--preflight"],
    ),
  ).toThrow();
  const pooled = valid.SKG_PROD_MIGRATION_EXPECTED_HOST.replace(
    "example.",
    "example-pooler.",
  );
  expect(() =>
    productionTarget(
      {
        ...valid,
        SKG_PROD_MIGRATION_EXPECTED_HOST: pooled,
        SKG_PROD_MIGRATION_DATABASE_URL:
          valid.SKG_PROD_MIGRATION_DATABASE_URL.replace(
            valid.SKG_PROD_MIGRATION_EXPECTED_HOST,
            pooled,
          ),
      },
      ["--preflight"],
    ),
  ).toThrow();
});

it("compares the complete ledger and refuses partial, mismatched and extra entries", () => {
  const rows = plan.map(({ folderMillis, hash }) => ({
    created_at: String(folderMillis),
    hash,
  }));
  expect(ledgerState(rows.slice(0, 8), plan)).toBe("pending");
  expect(ledgerState(rows, plan)).toBe("applied");
  for (const invalid of [
    rows.slice(0, 9),
    [...rows, rows[0]],
    [{ ...rows[0], hash: "incorrect" }, ...rows.slice(1)],
  ])
    expect(() => ledgerState(invalid, plan)).toThrow("ledger mismatch");
});

it("preflights read-only and rolls both migrations and ledger back on injected 0009 failure", async () => {
  calls.length = 0;
  await expect(
    runProductionPlan(db, "preflight", target, plan, migration),
  ).resolves.toBe("pending");
  expect(calls[0]).toContain("READ ONLY");
  expect(
    calls.some((sql) => /^LOCK|^DO|^INSERT|^CREATE/i.test(sql.trim())),
  ).toBe(false);
  await expect(
    runProductionPlan(db, "apply", target, plan, () =>
      applyDrizzlePlan(client, [plan[8], { ...plan[9], sql: ["SELECT 1/0"] }]),
    ),
  ).rejects.toThrow();
  await expect(
    runProductionPlan(db, "preflight", target, plan, migration),
  ).resolves.toBe("pending");
});

it("runs the unchanged 0008/0009 through Drizzle, verifies the result, and rejects replay", async () => {
  await expect(
    runProductionPlan(db, "apply", target, plan, migration),
  ).resolves.toBe("applied");
  await expect(
    runProductionPlan(db, "preflight", target, plan, migration),
  ).resolves.toBe("applied");
  await expect(
    runProductionPlan(db, "apply", target, plan, migration),
  ).rejects.toThrow("apply requires exactly 0007");
});
