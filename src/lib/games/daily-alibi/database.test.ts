import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import * as schema from "../../db/schema";

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => state.client }));
vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../../game-date", () => ({ getGameDate: () => "2026-11-04" }));
import { getDb } from "../../db";
import { getDailyAlibiChallenge } from "./daily";
import { createAlibiSeedStore, seedAlibiDailies } from "./seeding";
import { alibiCatalog } from "./catalog";
import { fingerprintAlibiCase } from "../alibi";
import { toDailyAlibiCase } from "./types";

const pg = new PGlite();
let store: ReturnType<typeof createAlibiSeedStore>;
type Query = {
  text: string;
  params: unknown[];
  then: PromiseLike<unknown>["then"];
};
// Execute the actual Neon tagged-template SQL against an isolated PostgreSQL
// engine, including constraints, all four child writes, and rollback semantics.
const client = Object.assign(
  (parts: TemplateStringsArray, ...params: unknown[]): Query => {
    const text = parts.reduce((a, p, i) => a + (i ? `$${i}` : "") + p, "");
    return {
      text,
      params,
      then: (resolve, reject) =>
        pg
          .query(text, params)
          .then((r) => r.rows)
          .then(resolve, reject),
    };
  },
  {
    transaction: async (queries: Query[]) => {
      await pg.exec("BEGIN");
      try {
        const rows = [];
        for (const q of queries)
          rows.push((await pg.query(q.text, q.params)).rows);
        await pg.exec("COMMIT");
        return rows;
      } catch (error) {
        await pg.exec("ROLLBACK");
        throw error;
      }
    },
  },
);
beforeAll(async () => {
  for (const file of readdirSync("drizzle")
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort())
    await pg.exec(
      readFileSync(path.join("drizzle", file), "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
  state.client = client;
  store = createAlibiSeedStore("postgresql://test-only");
  vi.mocked(getDb).mockReturnValue(
    drizzle(pg, { schema }) as unknown as NonNullable<ReturnType<typeof getDb>>,
  );
  await pg.exec(`INSERT INTO games(slug,name,description) VALUES ('perfect-stack','Perfect Stack','sentinel');
    INSERT INTO daily_challenges(game_id,challenge_date,challenge_number) SELECT id,'2026-11-04',137 FROM games WHERE slug='perfect-stack';
    INSERT INTO stack_puzzles(challenge_id,difficulty,generator_version,seed,fingerprint,rows,cols,pieces,canonical_solution,generation_metrics,optimal_placements)
    SELECT id,'small',2,'untouched','untouched',5,5,'[]','[]','{}',5 FROM daily_challenges;`);
}, 30000);
afterAll(async () => {
  await pg.close();
});

describe("real PostgreSQL Daily Alibi seed/retrieval integration", () => {
  const options = { start: "2026-11-04", days: 30 };
  it("dry-runs without creating even the Daily Alibi game row", async () => {
    const result = await seedAlibiDailies(store, alibiCatalog, {
      ...options,
      dryRun: true,
    });
    expect(result.planned).toHaveLength(30);
    expect(
      (await pg.query("SELECT id FROM games WHERE slug='daily-alibi'")).rows,
    ).toEqual([]);
  });
  it("writes all normalized records atomically and leaves Stack exactly unchanged", async () => {
    const before = (
      await pg.query("SELECT row_to_json(p) AS content FROM stack_puzzles p")
    ).rows;
    expect(
      (await seedAlibiDailies(store, alibiCatalog, options)).inserted,
    ).toBe(30);
    expect((await store.read()).filter((r) => r.complete)).toHaveLength(30);
    expect(
      (await pg.query("SELECT count(*)::int AS n FROM alibi_clues")).rows,
    ).toEqual([{ n: 120 }]);
    expect(
      (await pg.query("SELECT row_to_json(p) AS content FROM stack_puzzles p"))
        .rows,
    ).toEqual(before);
    expect(
      (
        await pg.query(
          "SELECT published_at FROM daily_challenges WHERE challenge_date='2026-11-05'",
        )
      ).rows,
    ).toEqual([{ published_at: null }]);
  });
  it("reruns idempotently and cannot overwrite already assigned dates", async () => {
    const before = await store.read();
    expect(
      (await seedAlibiDailies(store, [...alibiCatalog].reverse(), options))
        .inserted,
    ).toBe(0);
    expect(await store.read()).toEqual(before);
    await expect(
      pg.exec(
        `UPDATE alibi_cases SET case_id=(SELECT case_id FROM alibi_cases ORDER BY case_id LIMIT 1)`,
      ),
    ).rejects.toThrow();
    expect(await store.read()).toEqual(before);
  });
  it("loads today's assigned content, number and exact restorable fingerprint; blocks tomorrow", async () => {
    const rows = await store.read();
    const entry = alibiCatalog.find((c) => c.caseId === rows[0].caseId)!;
    const game = await getDailyAlibiChallenge();
    const expected = toDailyAlibiCase(entry, "2026-11-04", 137);
    expect(game).toEqual(expected);
    expect(fingerprintAlibiCase(game)).toBe(fingerprintAlibiCase(expected));
    await expect(getDailyAlibiChallenge("2026-11-05")).rejects.toThrow(
      "Future Daily",
    );
  });
  it("rejects a stale reservation without creating an orphan challenge", async () => {
    const { planAlibiDailies } = await import("./scheduling");
    const stale = planAlibiDailies(alibiCatalog, [], "2027-01-01", 1);
    expect(await store.insert(stale, "2026-11-04")).toBe(0);
    expect(
      (
        await pg.query(
          "SELECT id FROM daily_challenges WHERE challenge_date='2027-01-01'",
        )
      ).rows,
    ).toEqual([]);
  });
  it("rolls back the assignment when a child write violates a constraint", async () => {
    const { planAlibiDailies } = await import("./scheduling");
    const broken = structuredClone(
      planAlibiDailies(alibiCatalog, [], "2027-01-02", 1),
    );
    broken[0].entry.caseId = "test-rollback-only";
    broken[0].fingerprint = "test-rollback-fingerprint";
    broken[0].entry.suspects[1].key = broken[0].entry.suspects[0].key;
    await expect(store.insert(broken, "2026-11-04")).rejects.toThrow();
    expect(
      (
        await pg.query(
          "SELECT id FROM daily_challenges WHERE challenge_date='2027-01-02'",
        )
      ).rows,
    ).toEqual([]);
    expect(await store.read()).toHaveLength(30);
  });
});
