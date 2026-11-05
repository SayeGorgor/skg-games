import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import * as schema from "../../db/schema";
vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("./daily", () => ({ getDailyStackPuzzle: vi.fn() }));
import { getDb } from "../../db";
import { getDailyStackPuzzle } from "./daily";
import { recordAttempt } from "../../db/attempts";
import { readAccountStackProgress } from "./account-progress";
import { generateStackPuzzle } from "./generator";
const pg = new PGlite();
const small = generateStackPuzzle("small", "cross-device-small", {
  mode: "daily",
  challengeDate: "2026-11-04",
  challengeNumber: 137,
});
const medium = generateStackPuzzle("medium", "cross-device-medium", {
  mode: "daily",
  challengeDate: "2026-11-04",
  challengeNumber: 137,
});
const input = (userId: string, difficulty: "small" | "medium" = "small") => ({
  userId,
  anonymousId: null,
  gameSlug: "perfect-stack",
  mode: "daily" as const,
  variant: difficulty,
  challengeDate: "2026-11-04",
  challengeNumber: 137,
  clientEventId: crypto.randomUUID(),
  resultKey: `perfect-stack:2026-11-04:${difficulty}`,
  puzzleSeed: (difficulty === "small" ? small : medium).publicPuzzle.seed,
  solved: true,
  moves: 7,
  durationMs: 122000,
  completedAt: "2026-11-04T15:00:00Z",
  verified: true,
  result: {
    placements: (difficulty === "small" ? small : medium).canonicalSolution,
    stars: 2,
  },
});
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
  vi.mocked(getDb).mockReturnValue(
    drizzle(pg, { schema }) as unknown as NonNullable<ReturnType<typeof getDb>>,
  );
  vi.mocked(getDailyStackPuzzle).mockImplementation(
    async (d) => (d === "small" ? small : medium).publicPuzzle,
  );
  await pg.exec(`INSERT INTO games(slug,name,description) VALUES ('perfect-stack','Stack','test');
    INSERT INTO daily_challenges(game_id,challenge_date,challenge_number) SELECT id,'2026-11-04',137 FROM games;`);
}, 30000);
afterAll(async () => {
  await pg.close();
});
describe("account-owned completed snapshots in PostgreSQL", () => {
  it("stores score and exact arrangement together and restores two difficulties without exposing another account", async () => {
    await recordAttempt(input("account-A"));
    await recordAttempt(input("account-A", "medium"));
    const a = await readAccountStackProgress("account-A", "2026-11-04");
    expect(a.difficulties.small).toMatchObject({
      moves: 7,
      durationMs: 122000,
      stars: 2,
      placements: small.canonicalSolution,
    });
    expect(a.difficulties.medium?.placements).toEqual(medium.canonicalSolution);
    expect(a.difficulties.hard).toBeNull();
    expect(
      (await readAccountStackProgress("account-B", "2026-11-04")).difficulties,
    ).toEqual({ small: null, medium: null, hard: null });
  });
  it("acknowledges retries without another attempt or changing recorded metadata", async () => {
    const before = (
      await pg.query(
        "SELECT * FROM game_attempts WHERE user_id='account-A' ORDER BY variant",
      )
    ).rows;
    await recordAttempt({
      ...input("account-A"),
      moves: 90,
      durationMs: 900000,
    });
    expect(
      (
        await pg.query(
          "SELECT * FROM game_attempts WHERE user_id='account-A' ORDER BY variant",
        )
      ).rows,
    ).toEqual(before);
  });
  it("backfills a historical row without resultKey without changing its score, stars, time, ID or timestamp", async () => {
    await pg.exec(`INSERT INTO game_attempts(game_slug,user_id,challenge_date,challenge_number,variant,mode,solved,moves,duration_ms,result,completed_at)
      VALUES ('perfect-stack','legacy-A','2026-11-04',137,'small','daily',true,7,122000,'{"stars":2}','2026-11-04T15:00:00Z');`);
    const before = (
      await pg.query("SELECT * FROM game_attempts WHERE user_id='legacy-A'")
    ).rows[0] as Record<string, unknown>;
    expect(
      (await readAccountStackProgress("legacy-A", "2026-11-04")).difficulties
        .small?.placements,
    ).toBeNull();
    const data = input("legacy-A");
    await recordAttempt(data);
    await recordAttempt(data);
    const rows = (
      await pg.query("SELECT * FROM game_attempts WHERE user_id='legacy-A'")
    ).rows as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    for (const field of [
      "id",
      "moves",
      "duration_ms",
      "completed_at",
      "result_key",
    ])
      expect(rows[0][field]).toEqual(before[field]);
    expect(rows[0].result).toEqual({
      stars: 2,
      placements: small.canonicalSolution,
    });
    expect(
      (await readAccountStackProgress("legacy-A", "2026-11-04")).difficulties
        .small?.placements,
    ).toEqual(small.canonicalSolution);
  });
  it("ignores Practice records and treats corrupt snapshots as completed legacy results", async () => {
    await pg.exec(`INSERT INTO game_attempts(game_slug,user_id,challenge_date,challenge_number,variant,mode,solved,moves,duration_ms,result)
      VALUES ('perfect-stack','corrupt-A','2026-11-04',137,'small','daily',true,7,122000,'{"placements":[{}],"stars":2}'),
      ('perfect-stack','practice-A','2026-11-04',137,'small','practice',true,7,122000,'{}');`);
    const result = (await readAccountStackProgress("corrupt-A", "2026-11-04"))
      .difficulties.small;
    expect(result?.completed).toBe(true);
    expect(result?.placements).toBeNull();
    expect(result?.stars).toBe(2);
    expect(
      (await readAccountStackProgress("practice-A", "2026-11-04")).difficulties
        .small,
    ).toBeNull();
  });
});
