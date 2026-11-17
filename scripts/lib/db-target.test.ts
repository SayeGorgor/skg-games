import { expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { approvedDbTarget } from "./db-target";
import { runApprovedMigrations } from "./migration-runner";
const env = {
  SKG_MIGRATION_DATABASE_URL:
    "postgresql://operator:synthetic-password@ep-example.neon.tech/neondb?sslmode=require",
  SKG_MIGRATION_EXPECTED_HOST: "ep-example.neon.tech",
  SKG_MIGRATION_EXPECTED_DATABASE: "neondb",
  SKG_MIGRATION_EXPECTED_ROLE: "operator",
  SKG_MIGRATION_APPROVED_ISOLATED_BRANCH: "yes",
};
it("never falls back to runtime credentials or dotenv; missing approval/config fails before connecting", async () => {
  const connect = vi.fn();
  for (const key of Object.keys(env)) {
    await expect(
      runApprovedMigrations(
        {
          ...env,
          [key]: undefined,
          DATABASE_URL: env.SKG_MIGRATION_DATABASE_URL,
        },
        connect,
      ),
    ).rejects.toThrow();
  }
  await expect(
    runApprovedMigrations(
      { DATABASE_URL: env.SKG_MIGRATION_DATABASE_URL },
      connect,
    ),
  ).rejects.toThrow();
  expect(connect).not.toHaveBeenCalled();
  await expect(
    runApprovedMigrations({ ...env, NODE_ENV: "production" }, connect),
  ).rejects.toThrow(/production mode/);
  expect(connect).not.toHaveBeenCalled();
});
it("rejects mismatches, ambiguous options, malformed URLs and runtime migration identity without leaking secrets", () => {
  for (const url of [
    "not-a-url",
    env.SKG_MIGRATION_DATABASE_URL.replace("ep-example", "production"),
    env.SKG_MIGRATION_DATABASE_URL.replace("/neondb", "/other"),
    env.SKG_MIGRATION_DATABASE_URL + "&options=secret",
    env.SKG_MIGRATION_DATABASE_URL + "&sslmode=disable",
    env.SKG_MIGRATION_DATABASE_URL.replace(".tech/", ".tech:5555/"),
    env.SKG_MIGRATION_DATABASE_URL.replace(
      "sslmode=require",
      "sslmode=disable",
    ),
  ]) {
    expect(() =>
      approvedDbTarget(
        { ...env, SKG_MIGRATION_DATABASE_URL: url },
        "MIGRATION",
      ),
    ).toThrow(/target/);
  }
  expect(() =>
    approvedDbTarget(
      {
        ...env,
        SKG_MIGRATION_EXPECTED_ROLE: "skg_app",
        SKG_MIGRATION_DATABASE_URL: env.SKG_MIGRATION_DATABASE_URL.replace(
          "operator:",
          "skg_app:",
        ),
      },
      "MIGRATION",
    ),
  ).toThrow(/separate operator/);
});
it("checks actual server/session identity before any migration and never retries", async () => {
  const migrate = vi.fn();
  for (const identity of [
    { db: "other", role: "operator", session: "operator" },
    { db: "neondb", role: "operator", session: "other" },
  ])
    await expect(
      runApprovedMigrations(env, () => ({
        identity: async () => identity,
        migrate,
      })),
    ).rejects.toThrow(/mismatch/);
  expect(migrate).not.toHaveBeenCalled();
  await runApprovedMigrations(env, () => ({
    identity: async () => ({
      db: "neondb",
      role: "operator",
      session: "operator",
    }),
    migrate,
  }));
  expect(migrate).toHaveBeenCalledTimes(1);
});
it("keeps offline generation and normal runtime independent of operator credentials", () => {
  expect(readFileSync("drizzle.config.ts", "utf8")).not.toMatch(
    /dotenv|process.env|dbCredentials/,
  );
  function visit(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? visit(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
    );
  }
  for (const file of visit("src").filter((f) => /\.(ts|tsx)$/.test(f)))
    expect(readFileSync(file, "utf8"), file).not.toMatch(
      /SKG_MIGRATION|scripts\/lib\/(db-target|migration-runner)/,
    );
});
